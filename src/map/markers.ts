import L from 'leaflet';
import 'leaflet.markercluster';
import { toLatLng } from './crs';
import { pinIcon, type PinState } from '../icons/pin';
import type { Category, Group, Marker } from '../data/types';

export interface MarkerLayerOptions {
  onSelect?: (m: Marker) => void;
  isFound?: (id: string) => boolean;
  isNew?: (m: Marker) => boolean;
  size?: () => number;
}

/**
 * Markers are built lazily per category (only when that category is first shown) and share one icon per
 * (category, state). Clustering: radius 40, tapping a cluster zooms in, no spiderfy.
 */
export class MarkerLayer {
  readonly cluster: L.MarkerClusterGroup;
  private built = new Map<string, L.Marker[]>();
  private visible = new Set<string>();
  private shown = new Set<L.Marker>();
  private hideFound = false;
  private byCat = new Map<string, Marker[]>();
  private leaflet = new Map<string, L.Marker>();
  private colors = new Map<string, string>();

  constructor(private map: L.Map, markers: Marker[], categories: Category[], groups: Group[], private opts: MarkerLayerOptions = {}) {
    const gColor = new Map(groups.map((g) => [g.id, g.color]));
    for (const c of categories) this.colors.set(c.id, c.color || gColor.get(c.group) || '#888');
    for (const m of markers) {
      const list = this.byCat.get(m.category) ?? [];
      list.push(m);
      this.byCat.set(m.category, list);
    }
    this.cluster = L.markerClusterGroup({
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: false,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 4,
      chunkedLoading: true,
      removeOutsideVisibleBounds: true,
      animate: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      iconCreateFunction: (c) => {
        const n = c.getChildCount();
        const s = n < 10 ? 32 : n < 100 ? 38 : 44;
        return L.divIcon({ className: 'cluster', html: `<span>${n}</span>`, iconSize: [s, s] });
      },
    });
    this.cluster.on('clusterclick', (e: L.LeafletEvent & { layer: L.MarkerCluster }) => {
      e.layer.zoomToBounds({ padding: [40, 40] });
    });
    map.addLayer(this.cluster);
  }

  private selected: string | null = null;

  private iconOf(m: Marker, color = this.colors.get(m.category) ?? '#888') {
    return pinIcon(m.category, color, this.stateOf(m), this.opts.size?.() ?? 30, m.id === this.selected);
  }

  /** Highlight the marker whose card is open (null clears). */
  select(id: string | null): void {
    const prev = this.selected;
    this.selected = id;
    for (const x of [prev, id]) {
      const lm = x ? this.leaflet.get(x) : undefined;
      if (lm) { lm.setIcon(this.iconOf(dataOf(lm))); lm.setZIndexOffset(x === id ? 1000 : 0); }
    }
  }

  private stateOf(m: Marker): PinState {
    if (this.opts.isFound?.(m.id)) return 'found';
    if (this.opts.isNew?.(m)) return 'new';
    return 'normal';
  }

  private build(catId: string): L.Marker[] {
    let list = this.built.get(catId);
    if (list) return list;
    const color = this.colors.get(catId) ?? '#888';
    list = (this.byCat.get(catId) ?? []).map((m) => {
      const lm = L.marker(toLatLng(m.x, m.y), {
        icon: this.iconOf(m, color),
        title: m.name,
        alt: m.name,
        keyboard: true,
        riseOnHover: true,
      });
      lm.on('click', () => this.opts.onSelect?.(m));
      (lm as L.Marker & { data: Marker }).data = m;
      this.leaflet.set(m.id, lm);
      return lm;
    });
    this.built.set(catId, list);
    return list;
  }

  /**
   * Show exactly the markers of the given categories, optionally without found ones. Diffs against what's on the
   * map so toggling one category only touches that category's markers. Debounce at the caller.
   */
  apply(ids: Iterable<string>, hideFound = false): void {
    this.visible = new Set(ids);
    this.hideFound = hideFound;
    const want = new Set<L.Marker>();
    for (const id of this.visible) for (const lm of this.build(id)) if (!(hideFound && this.opts.isFound?.(dataOf(lm).id))) want.add(lm);
    const remove = [...this.shown].filter((l) => !want.has(l));
    const add = [...want].filter((l) => !this.shown.has(l));
    if (remove.length) this.cluster.removeLayers(remove);
    if (add.length) this.cluster.addLayers(add);
    this.shown = want;
  }

  /** Re-draw one marker after its found/new state changed (and add/remove it when found markers are hidden). */
  refresh(id: string): void {
    const lm = this.leaflet.get(id);
    if (!lm) return;
    const m = dataOf(lm);
    lm.setIcon(this.iconOf(m));
    if (this.hideFound && this.visible.has(m.category)) this.apply(this.visible, true);
  }

  /** Re-draw every built marker (e.g. after switching profile). */
  refreshAll(): void {
    for (const lm of this.leaflet.values()) {
      const m = dataOf(lm);
      lm.setIcon(this.iconOf(m));
    }
    this.apply(this.visible, this.hideFound);
  }

  markersOf(categoryId: string): Marker[] { return this.byCat.get(categoryId) ?? []; }

  /**
   * Fly to a marker, uncluster it and pulse it. `bottomInset` (px) is the part of the screen covered by a bottom
   * sheet: the marker is centred in the visible area above it. Pass zoom = null to keep the current zoom.
   */
  focus(m: Marker, zoom: number | null = 5, bottomInset = 0): void {
    this.build(m.category);
    const lm = this.leaflet.get(m.id);
    const ll = toLatLng(m.x, m.y);
    const z = zoom === null ? this.map.getZoom() : Math.max(zoom, this.map.getZoom());
    const go = () => {
      if (lm && this.shown.has(lm) && this.cluster.getVisibleParent(lm) !== lm) this.cluster.zoomToShowLayer(lm, () => pulse(lm));
      else if (lm && this.shown.has(lm)) pulse(lm);
      else this.pulseAt(ll);
    };
    // centre of the visible area, in container px
    const size = this.map.getSize();
    const visible = L.bounds([0, 0], [size.x, Math.max(80, size.y - bottomInset)]);
    const target = this.map.unproject(this.map.project(ll, z).add([0, bottomInset / 2]), z);
    const pt = this.map.latLngToContainerPoint(ll);
    // "in view" = clear of the sheet, the screen edges and the floating controls column on the right
    const inView = this.map.getZoom() >= z && visible.contains(pt) && pt.y > 60 && pt.y < size.y - bottomInset - 40 && pt.x > 40 && pt.x < size.x - 80;
    if (inView) { go(); return; }
    const anim = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.map.once('moveend', go);
    if (anim) this.map.flyTo(target, z, { duration: 0.8 });
    else this.map.setView(target, z, { animate: false });
  }

  private pulseAt(ll: L.LatLng) {
    const ring = L.marker(ll, { interactive: false, icon: L.divIcon({ className: 'pulse', iconSize: [56, 56] }) }).addTo(this.map);
    setTimeout(() => ring.remove(), 1600);
  }
}

const dataOf = (l: L.Marker) => (l as L.Marker & { data: Marker }).data;

function pulse(lm: L.Marker) {
  const el = lm.getElement();
  if (!el) return;
  el.classList.remove('pin-pulse');
  void el.offsetWidth;
  el.classList.add('pin-pulse');
  setTimeout(() => el.classList.remove('pin-pulse'), 1600);
}
