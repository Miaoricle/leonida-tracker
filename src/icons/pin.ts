import L from 'leaflet';
import { GLYPHS } from './glyphs';
import { iconFor, FALLBACK_ICON } from './mapping';

/** Inline SVG for a Material Symbol glyph. */
export function glyphSvg(name: string, size = 24, cls = ''): string {
  const d = GLYPHS[name] ?? GLYPHS[FALLBACK_ICON];
  return `<svg class="ms ${cls}" width="${size}" height="${size}" viewBox="0 -960 960 960" aria-hidden="true"><path d="${d}"/></svg>`;
}

export type PinState = 'normal' | 'found' | 'new' | 'selected';

const cache = new Map<string, L.DivIcon>();

/** Round coloured pin with a white category glyph. Icons are shared per (category, state, size). */
export function pinIcon(categoryId: string, color: string, state: PinState = 'normal', size = 30): L.DivIcon {
  const key = `${categoryId}|${color}|${state}|${size}`;
  let icon = cache.get(key);
  if (!icon) {
    const g = Math.round(size * 0.6);
    const badge = state === 'found' ? `<span class="pin-badge pin-check">${glyphSvg('check', 12)}</span>`
      : state === 'new' ? '<span class="pin-badge pin-new">NEW</span>' : '';
    icon = L.divIcon({
      className: `pin pin-s-${state}`,
      html: `<span class="pin-dot" style="--c:${color};width:${size}px;height:${size}px">${glyphSvg(iconFor(categoryId), g)}</span>${badge}`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
    cache.set(key, icon);
  }
  return icon;
}

export function clearPinCache() { cache.clear(); }
