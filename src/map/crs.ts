import L from 'leaflet';

/**
 * Game coordinates <-> Leaflet.
 *
 * World: 32768 x 32768 game units centred on (0, 0) ("world half-size" 16384). At zoom 0 the whole world is
 * 1024 px (4 tiles of 256 px), so 1 px = 32 game units at z0. Game y grows northwards and screen y grows
 * downwards, hence the -1/32. This matches both gtadb.org (mapW 32768, zeroX/zeroY 16384, 1024 px at z0)
 * and GTABase (L.CRS.Simple + Transformation(1/32, 512, -1/32, 512)).
 *
 * Alignment check (Phase 2, 22 Nov 2026): GTABase coordinates drawn over the gtadb "day" tiles with NO correction
 * land on the right spots: VC International Airport (terminal), Jason's House safehouse (Key Lento waterfront),
 * Southside Hospital, Leonida Penitentiary (inside the compound), Washington Beach Marina, and GTABase's county
 * outlines follow the gtadb coastlines. Screenshots: `node scripts/alignment-shots.mjs <dir>` (kept out of this
 * repo because the pins are private data). If a future tile set needs a correction, apply it here:
 *   OFFSET_X / OFFSET_Y in game units, SCALE as a multiplier around (0, 0).
 */
export const HALF = 16384;
export const OFFSET_X = 0;
export const OFFSET_Y = 0;
export const SCALE = 1;

export const GameCRS: L.CRS = L.extend({}, L.CRS.Simple, {
  transformation: new L.Transformation(1 / 32, 512, -1 / 32, 512),
});

/** Game (x, y) -> Leaflet LatLng (lat = y, lng = x after correction). */
export function toLatLng(x: number, y: number): L.LatLng {
  return L.latLng(y * SCALE + OFFSET_Y, x * SCALE + OFFSET_X);
}

/** Leaflet LatLng -> game (x, y). Inverse of toLatLng. */
export function toGame(ll: L.LatLngExpression): { x: number; y: number } {
  const p = L.latLng(ll);
  return { x: (p.lng - OFFSET_X) / SCALE, y: (p.lat - OFFSET_Y) / SCALE };
}

/** Bounds (in game units) for a z6 tile range: 128 game units per tile at z6. */
export function tileRangeBounds(r: { minX: number; maxX: number; minY: number; maxY: number }, z = 6): L.LatLngBounds {
  const unit = (2 * HALF) / (4 * 2 ** z);
  return L.latLngBounds(
    L.latLng(HALF - (r.maxY + 1) * unit, r.minX * unit - HALF),
    L.latLng(HALF - r.minY * unit, (r.maxX + 1) * unit - HALF),
  );
}
