import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { estimate, tileUrls, type TileIndex } from '../../src/offline';

const idx: TileIndex = JSON.parse(fs.readFileSync('public/tiles/index.json', 'utf8'));

describe('offline tile download', () => {
  it('lists exactly the tiles that exist, low zooms first', () => {
    const urls = tileUrls(idx, 6, '/b/');
    expect(urls.length).toBe(estimate(idx, 6).count);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls[0]).toMatch(/^\/b\/tiles\/0\/0,\d+,\d+\.jpg$/);
    expect(urls.every((u) => fs.existsSync(`public${u.replace('/b/', '/')}`))).toBe(true);
  });
  it('estimates size per zoom ceiling', () => {
    const z4 = estimate(idx, 4), z6 = estimate(idx, 6);
    expect(z4.count).toBeLessThan(z6.count);
    expect(z6.bytes).toBeGreaterThan(80e6); // the full vendored set (~86 MB)
    expect(tileUrls(idx, 4, '/').length).toBe(z4.count);
  });
});
