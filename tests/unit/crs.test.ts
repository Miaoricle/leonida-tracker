// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import L from 'leaflet';
import { GameCRS, toLatLng, toGame, tileRangeBounds, HALF } from '../../src/map/crs';

describe('CRS', () => {
  it('round-trips game coordinates through Leaflet', () => {
    for (const [x, y] of [[0, 0], [-2354, -5532], [2189.5, 9415], [-16384, 16384]]) {
      const g = toGame(toLatLng(x, y));
      expect(g.x).toBeCloseTo(x, 6);
      expect(g.y).toBeCloseTo(y, 6);
    }
  });
  it('matches gtadb / GTABase pixel space: 1024 px world at z0, y up', () => {
    const p0 = GameCRS.latLngToPoint(toLatLng(-HALF, HALF), 0); // top-left corner of the world
    expect(p0.x).toBeCloseTo(0); expect(p0.y).toBeCloseTo(0);
    const c = GameCRS.latLngToPoint(toLatLng(0, 0), 0);
    expect(c.x).toBeCloseTo(512); expect(c.y).toBeCloseTo(512);
    const z6 = GameCRS.latLngToPoint(toLatLng(128, 0), 6); // 128 game units = 1 tile (256 px) at z6
    expect(z6.x - GameCRS.latLngToPoint(toLatLng(0, 0), 6).x).toBeCloseTo(256);
    expect(GameCRS.pointToLatLng(L.point(512, 512), 0).lat).toBeCloseTo(0);
  });
  it('tile range bounds cover whole tiles', () => {
    const b = tileRangeBounds({ minX: 34, maxX: 167, minY: 34, maxY: 206 }, 6);
    expect(b.getWest()).toBe(34 * 128 - HALF);
    expect(b.getEast()).toBe(168 * 128 - HALF);
    expect(b.getNorth()).toBe(HALF - 34 * 128);
    expect(b.getSouth()).toBe(HALF - 207 * 128);
  });
});
