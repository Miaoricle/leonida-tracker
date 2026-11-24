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

/** In-game map blip pictures per category (from the private data's icons.json); empty = symbol pins. */
let blips: Record<string, string> = {};
export function setBlipIcons(data: unknown) {
  const d = data as { icons?: Record<string, string>; files?: Record<string, string> } | undefined;
  const next: Record<string, string> = {};
  for (const [cat, key] of Object.entries(d?.icons ?? {})) {
    const uri = d?.files?.[key];
    if (typeof uri === 'string' && /^data:image\/(webp|png);base64,[A-Za-z0-9+/=]+$/.test(uri)) next[cat] = uri;
  }
  blips = next;
  cache.clear();
}
export const hasBlip = (categoryId: string) => categoryId in blips;

/** Round coloured pin with a white category glyph. Icons are shared per (category, state, size). */
export function pinIcon(categoryId: string, color: string, state: PinState = 'normal', size = 30, selected = false, blip = true): L.DivIcon {
  const img = blip ? blips[categoryId] : undefined;
  const key = `${categoryId}|${color}|${state}|${size}|${selected}|${!!img}`;
  let icon = cache.get(key);
  if (!icon) {
    const g = Math.round(size * 0.6);
    const badge = state === 'found' ? `<span class="pin-badge pin-check">${glyphSvg('check', 12)}</span>`
      : state === 'new' ? '<span class="pin-badge pin-new">NEW</span>' : '';
    if (img) {
      // speech-bubble blip (56x64 picture, tail at the bottom): anchored on the tail tip
      const w = Math.round(size * 1.15), h = Math.round(w * 64 / 56);
      icon = L.divIcon({
        className: `pin pin-b pin-s-${state}${selected ? ' pin-sel' : ''}`,
        html: `<img class="pin-dot pin-blip" src="${img}" width="${w}" height="${h}" alt="" draggable="false">${badge}`,
        iconSize: [w, h],
        iconAnchor: [w / 2, h - 1],
      });
      cache.set(key, icon);
      return icon;
    }
    icon = L.divIcon({
      className: `pin pin-s-${state}${selected ? ' pin-sel' : ''}`,
      html: `<span class="pin-dot" style="--c:${color};width:${size}px;height:${size}px">${glyphSvg(iconFor(categoryId), g)}</span>${badge}`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
    cache.set(key, icon);
  }
  return icon;
}

export function clearPinCache() { cache.clear(); }

/** Small category icon for lists: the blip picture when available, else the symbol glyph (caller styles the wrapper). */
export function catIcon(categoryId: string, glyph: string, size = 18): { html: string; blip: boolean } {
  const img = blips[categoryId];
  return img ? { html: `<img class="blip-ico" src="${img}" width="${Math.round(size * 1.15)}" height="${Math.round(size * 1.15 * 64 / 56)}" alt="">`, blip: true } : { html: glyphSvg(glyph, size), blip: false };
}

/** Round coloured list icon (search results, stats), or the blip picture. */
export function hitIco(categoryId: string, color: string): string {
  const ic = catIcon(categoryId, iconFor(categoryId), 18);
  return `<span class="hit-ico${ic.blip ? ' has-blip' : ''}" style="--c:${color}">${ic.html}</span>`;
}
