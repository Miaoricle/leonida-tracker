// Vendors gtadb.org GTA VI "day" tiles (MIT code / CC BY 4.0 data, "gtadb.org and all contributors")
// into public/tiles/{z}/{z},{y},{x}.jpg and writes public/tiles/ranges.json.
// gtadb asks apps not to hit gtadb.org live, so we clone the repo instead.
//   npm run tiles            # clone (if needed) + copy
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'vendor-src/gtadb');
const SET = process.env.TILE_SET || 'day';
const TILES = path.join(SRC, 'maps/tiles/6', SET);
const OUT = path.join(ROOT, 'public/tiles');
const sh = (c, cwd = ROOT) => execSync(c, { cwd, stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });

if (!fs.existsSync(TILES)) {
  fs.mkdirSync(path.dirname(SRC), { recursive: true });
  if (!fs.existsSync(SRC)) sh('git clone --depth 1 --filter=blob:none --sparse https://github.com/rolux/gtadb.org.git vendor-src/gtadb');
  sh(`git sparse-checkout set --no-cone /maps/tiles/6/${SET}/ /readme.md /LICENSE /LICENSE-DATA /maps/maps.js`, SRC);
}
fs.rmSync(OUT, { recursive: true, force: true });
const ranges = {};
let files = 0, bytes = 0;
for (const z of fs.readdirSync(TILES).filter((d) => /^\d+$/.test(d)).sort((a, b) => a - b)) {
  fs.mkdirSync(path.join(OUT, z), { recursive: true });
  const r = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const f of fs.readdirSync(path.join(TILES, z))) {
    const m = f.match(/^(\d+),(\d+),(\d+)\.jpg$/);
    if (!m) continue;
    const [y, x] = [+m[2], +m[3]];
    r.minX = Math.min(r.minX, x); r.maxX = Math.max(r.maxX, x); r.minY = Math.min(r.minY, y); r.maxY = Math.max(r.maxY, y);
    fs.copyFileSync(path.join(TILES, z, f), path.join(OUT, z, f));
    files++; bytes += fs.statSync(path.join(OUT, z, f)).size;
  }
  ranges[z] = r;
}
fs.copyFileSync(path.join(SRC, 'LICENSE-DATA'), path.join(OUT, 'LICENSE-DATA.txt'));
fs.writeFileSync(path.join(OUT, 'ranges.json'), JSON.stringify({ set: SET, source: 'gtadb.org and all contributors (CC BY 4.0)', zooms: ranges }, null, 1));
console.log(`Copied ${files} tiles, ${(bytes / 1e6).toFixed(1)} MB`, ranges);
