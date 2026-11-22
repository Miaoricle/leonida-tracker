import L from 'leaflet';
import { toLatLng } from './crs';
import type { Label } from '../data/types';

/**
 * Place labels in 5 tiers. Visibility per zoom is CSS-driven (see .lbl-* rules in style.css):
 *   county  z -1..1   · region z 0..3   · city z 0..4   · town z 2..5   · district z 3..7
 * County outlines are drawn faintly at low zoom.
 */
export function addLabels(map: L.Map, labels: Label[]): void {
  map.createPane('county-lines').style.zIndex = '250';
  map.createPane('place-labels').style.zIndex = '450';
  map.getPane('place-labels')!.style.pointerEvents = 'none';

  const lines = L.layerGroup().addTo(map);
  for (const l of labels) {
    if (!Number.isFinite(l.x) || !Number.isFinite(l.y)) continue; // never invent coordinates
    if (l.type === 'county' && l.polygon) {
      for (const ring of l.polygon) {
        L.polygon(ring.map(([x, y]) => toLatLng(x, y)), {
          pane: 'county-lines', className: 'county-line', interactive: false, fill: false, weight: 1.5, dashArray: '4 6',
        }).addTo(lines);
      }
    }
    const span = document.createElement('span');
    span.textContent = l.type === 'county' ? l.name.replace(/ County$/, '') + ' County' : l.name;
    L.marker(toLatLng(l.x, l.y), {
      pane: 'place-labels', interactive: false, keyboard: false,
      icon: L.divIcon({ className: `lbl lbl-${l.type}`, html: span, iconSize: undefined }),
    }).addTo(map);
  }
}
