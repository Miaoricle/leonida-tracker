import L from 'leaflet';
import { GameCRS, toGame, tileRangeBounds } from './crs';

export interface TileRanges { set: string; zooms: Record<string, { minX: number; maxX: number; minY: number; maxY: number }> }

export const MAX_NATIVE_ZOOM = 6;
export const MIN_ZOOM = -1;
export const MAX_ZOOM = 7;
const VIEW_KEY = 'leonida.view';

/**
 * Sharpness on high-density screens (iPhone = 3 device px per CSS px): load the NEXT zoom level's tiles at half
 * size, so each screen pixel gets a real map pixel instead of a stretched one (same idea as Leaflet's
 * detectRetina, done explicitly so the tile-range check and max native zoom stay correct).
 */
export const TILE_OFFSET = (globalThis.devicePixelRatio ?? 1) >= 1.5 ? 1 : 0;

/** Tile layer that only requests tiles that exist in the vendored set (no 404 storms). */
const RangedTileLayer = L.TileLayer.extend({
  _isValidTile(this: L.TileLayer & { options: { ranges: TileRanges } }, coords: L.Coords) {
    const want = coords.z + TILE_OFFSET; // grid zoom -> zoom in the tile URL
    const z = Math.min(want, MAX_NATIVE_ZOOM);
    const scale = 2 ** (want - z);
    const r = this.options.ranges.zooms[String(z)];
    if (!r) return false;
    const x = Math.floor(coords.x / scale), y = Math.floor(coords.y / scale);
    return x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;
  },
});

export function readSavedView(): { x: number; y: number; z: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) ? v : null;
  } catch { return null; }
}

export function createMap(el: HTMLElement, ranges: TileRanges): L.Map {
  const z6 = ranges.zooms['6'];
  const world = tileRangeBounds(z6, 6);
  const map = L.map(el, {
    crs: GameCRS,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomSnap: 1,
    zoomControl: false,
    attributionControl: false,
    maxBounds: world.pad(0.3),
    maxBoundsViscosity: 1,
    inertia: true,
    tapHold: true,
    preferCanvas: false,
    worldCopyJump: false,
  });

  const tileUrl = `${import.meta.env.BASE_URL}tiles/{z}/{z},{y},{x}.jpg`;
  new (RangedTileLayer as unknown as new (url: string, o: object) => L.TileLayer)(tileUrl, {
    ranges,
    tileSize: 256 / 2 ** TILE_OFFSET,
    zoomOffset: TILE_OFFSET,
    maxNativeZoom: MAX_NATIVE_ZOOM - TILE_OFFSET,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    noWrap: true,
    bounds: world,
    keepBuffer: 3,
    updateWhenIdle: false,
    className: 'tiles',
  }).addTo(map);

  // data-zoom on the container drives label visibility in CSS
  const zoomClass = () => { el.dataset.zoom = String(Math.round(map.getZoom())); };
  map.on('zoomend', zoomClass);

  map.on('moveend', () => {
    const c = toGame(map.getCenter());
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ x: Math.round(c.x), y: Math.round(c.y), z: map.getZoom() })); } catch { /* private mode */ }
  });

  setTimeout(zoomClass);
  return map;
}
