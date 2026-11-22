import L from 'leaflet';
import 'leaflet.markercluster';
import { toLatLng } from './crs';
import { pinIcon, type PinState } from '../icons/pin';
import type { Category, Group, Marker } from '../data/types';

export interface MarkerLayerOptions {
  onSelect?: (m: Marker) => void;
  isFound?: (id: string) => boolean;
  isNew?: (m: Marker) => boolean;
  foundStyle?: () => 'fade' | 'hide';
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
  private byCat = new Map<string, Marker[]>();
  private leaflet = new Map<string, L.Marker>();
  private colors = new Map<string, string>();

  constructor(map: L.Map, markers: Marker[], categories: Category[], groups: Group[], private opts: MarkerLayerOptions = {}) {
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
        icon: pinIcon(catId, color, this.stateOf(m), this.opts.size?.() ?? 30),
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

  /** Set the visible categories (debounce at the caller). */
  setVisible(ids: Iterable<string>): void {
    const next = new Set(ids);
    const add: L.Marker[] = [], remove: L.Marker[] = [];
    for (const id of this.visible) if (!next.has(id)) remove.push(...(this.built.get(id) ?? []));
    for (const id of next) if (!this.visible.has(id)) add.push(...this.build(id));
    if (remove.length) this.cluster.removeLayers(remove);
    if (add.length) this.cluster.addLayers(add.filter((l) => !this.isHiddenFound(l)));
    this.visible = next;
  }

  private isHiddenFound(l: L.Marker): boolean {
    return this.opts.foundStyle?.() === 'hide' && !!this.opts.isFound?.((l as L.Marker & { data: Marker }).data.id);
  }

  /** Re-draw one marker after its found/new state changed. */
  refresh(id: string): void {
    const lm = this.leaflet.get(id) as (L.Marker & { data: Marker }) | undefined;
    if (!lm) return;
    lm.setIcon(pinIcon(lm.data.category, this.colors.get(lm.data.category) ?? '#888', this.stateOf(lm.data), this.opts.size?.() ?? 30));
  }

  get(id: string): L.Marker | undefined {
    const m = [...this.byCat.values()].flat().find((x) => x.id === id);
    if (m) this.build(m.category);
    return this.leaflet.get(id);
  }
}
