// Dev-only: screenshots 5 reference markers over the tiles for the CRS alignment check.
// Usage: (npm run dev in another shell) node scripts/alignment-shots.mjs <outDir> [label]
// Output stays OUTSIDE the repo: the pins come from the private GTABase data.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const out = process.argv[2]; const tag = process.argv[3] || 'before';
fs.mkdirSync(out, { recursive: true });
const IDS = ['public-transport-005', 'safehouse-001', 'hospital-002', 'landmark-006', 'marina-002'];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message)); p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
await p.goto('http://localhost:5173/leonida-tracker/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__leonida, null, { timeout: 60000 });
for (const id of IDS) {
  const name = await p.evaluate((id) => {
    const { map, data, toLatLng } = window.__leonida;
    const m = data.markers.find((x) => x.id === id);
    map.setView(toLatLng(m.x, m.y), 5, { animate: false });
    return m.name;
  }, id);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/${tag}-${id}.png` });
  console.log(id, name);
}
await p.evaluate(() => window.__leonida.map.setView(window.__leonida.toLatLng(-3000, 0), 0, { animate: false }));
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/${tag}-overview.png` });
await b.close();
