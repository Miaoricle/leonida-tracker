// Dev-only: map sharpness comparison at iPhone 13 pixel density. node scripts/sharp-shots.mjs <outDir> <tag>
// (with `npx vite preview --port 4173` running; uses the synthetic fixture, no private data)
import { chromium, devices } from '@playwright/test';
import path from 'node:path';
const [out, tag] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 3 }); const p = await ctx.newPage();
await p.goto('http://localhost:4173/leonida-tracker/', { waitUntil: 'domcontentloaded' });
await p.locator('#settings[data-snap="full"]').waitFor();
const reload = p.waitForEvent('load');
await p.locator('#settings input.data-file').setInputFiles(['markers', 'categories', 'labels', 'meta'].map((f) => path.resolve(`tests/fixtures/${f}.json`)));
await reload; await p.waitForTimeout(1500);
for (const [name, x, y, z] of [['city', 300, 900, 4], ['street', -700, 420, 6]]) {
  await p.goto(`http://localhost:4173/leonida-tracker/?at=${x},${y},${z}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  await p.evaluate(() => document.querySelectorAll('.leaflet-tooltip, .shared-spot').forEach((e) => e.remove()));
  await p.screenshot({ path: `${out}/${tag}-${name}.png`, clip: { x: 0, y: 120, width: 390, height: 360 } });
  console.log(tag, name, 'tile zooms:', [...new Set(await p.evaluate(() => [...document.querySelectorAll('.leaflet-tile-loaded')].map((t) => t.src.match(/tiles\/(\d+)\//)?.[1])))].join(','));
}
await b.close();
