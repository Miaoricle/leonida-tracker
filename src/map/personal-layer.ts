import L from 'leaflet';
import { toLatLng, toGame } from './crs';
import { pinIcon } from '../icons/pin';
import type { PersonalMarker } from '../db';
import type { PersonalStore } from '../state/personal';
import { CUSTOM_COLOR } from '../state/personal';

/**
 * Personal markers: never clustered, drawn above GTABase pins with a dashed ring. A pin becomes draggable only
 * while its card is open (no accidental moves while panning).
 */
export class PersonalLayer {
  private group = L.layerGroup();
  private byId = new Map<string, L.Marker>();
  private selected: string | null = null;
  visible = true;

  constructor(map: L.Map, private store: PersonalStore, private color: (categoryId: string) => string | undefined,
    private opts: { onSelect: (m: PersonalMarker) => void; isFound: (id: string) => boolean; size?: () => number }) {
    this.group.addTo(map);
    store.on(() => this.render());
  }

  private icon(m: PersonalMarker) {
    const icon = pinIcon(m.customCategory ? 'custom' : m.category, this.color(m.category) ?? CUSTOM_COLOR, this.opts.isFound(m.id) ? 'found' : 'normal', this.opts.size?.() ?? 30, m.id === this.selected, false);
    return L.divIcon({ ...icon.options, className: `${icon.options.className} pin-user` });
  }

  render() {
    this.group.clearLayers();
    this.byId.clear();
    if (!this.visible) return;
    for (const m of this.store.list) {
      const lm = L.marker(toLatLng(m.x, m.y), { icon: this.icon(m), title: m.name, alt: m.name, zIndexOffset: 500, draggable: false, autoPan: true });
      lm.on('click', () => this.opts.onSelect(m));
      lm.on('dragend', () => {
        const g = toGame(lm.getLatLng());
        void this.store.save({ ...this.store.get(m.id)!, x: Math.round(g.x), y: Math.round(g.y) });
      });
      lm.addTo(this.group);
      this.byId.set(m.id, lm);
    }
    this.applySelection();
  }

  select(id: string | null) {
    this.selected = id;
    this.applySelection();
  }

  private applySelection() {
    for (const [id, lm] of this.byId) {
      const m = this.store.get(id);
      if (!m) continue;
      lm.setIcon(this.icon(m));
      if (id === this.selected) lm.dragging?.enable(); else lm.dragging?.disable();
    }
  }

  setVisible(v: boolean) { this.visible = v; this.render(); }
  refresh() { this.applySelection(); }
}
