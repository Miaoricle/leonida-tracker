// Dev-only Phase 5 walkthrough against `vite preview` (production build, no dev-data).
// Usage: LEONIDA_TOKEN=... node scripts/e2e-phase5.mjs <outDir> <path-to-leonida-data/data>
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const [out, dataDir] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const APP = 'http://localhost:4173/leonida-tracker/';
const token = process.env.LEONIDA_TOKEN;
const b = await chromium.launch();
const log = (...a) => console.log(...a);

async function page(ctx) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => log('PAGEERROR', e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_BLOCKED_BY_RESPONSE/.test(m.text()) && log('CONSOLE', m.text()));
  p.on('request', (r) => { if (r.headers()['authorization'] && !r.url().startsWith('https://api.github.com/')) log('!!! TOKEN SENT TO', r.url()); });
  return p;
}
const shot = async (p, n, w = 900) => { await p.waitForTimeout(w); await p.screenshot({ path: `${out}/${n}.png` }); log('shot', n); };
const markersOnMap = (p) => p.evaluate(() => document.querySelectorAll('.leaflet-marker-icon.pin, .cluster').length);

// ---------- A. token path ----------
{
  const ctx = await b.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
  const p = await page(ctx);
  await p.goto(APP, { waitUntil: 'domcontentloaded' });
  await p.locator('#settings[data-snap="full"]').waitFor({ timeout: 30000 });
  await shot(p, 'A1-onboarding');
  if (token) {
    await p.locator('#settings .token').fill(token);
    await p.locator('#settings [data-a="test"]').click();
    await p.waitForEvent('load', { timeout: 90000 }); // reloads after the first fetch
    await p.waitForTimeout(2500);
    log('after token: markers/clusters on map =', await markersOnMap(p));
    await shot(p, 'A2-loaded-from-github');
    await p.getByRole('button', { name: 'Menu' }).click();
    await p.locator('[data-go="settings"]').click();
    await p.waitForTimeout(800);
    log('status:', (await p.locator('.status-line').innerText()).replace(/\s+/g, ' '));
    await p.locator('#settings [data-a="check"]').click();
    await p.waitForTimeout(4000);
    log('toasts:', await p.locator('.toast').allInnerTexts());
    await shot(p, 'A3-settings-after-check', 200);
    // backup export
    const dl = p.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await p.locator('#settings [data-a="export"]').click();
    const d = await dl;
    if (d) { await d.saveAs(`${out}/backup.json`); log('backup saved', fs.statSync(`${out}/backup.json`).size, 'bytes'); }
  } else log('LEONIDA_TOKEN not set: skipping token path');
  await ctx.close();
}

// ---------- B. no-token import path + personal marker + backup import ----------
{
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await page(ctx);
  await p.goto(APP, { waitUntil: 'domcontentloaded' });
  await p.locator('#settings[data-snap="full"]').waitFor({ timeout: 30000 });
  await p.locator('#settings .data-file').setInputFiles(['markers.json', 'categories.json', 'labels.json', 'meta.json'].map((f) => path.join(dataDir, f)));
  await p.waitForEvent('load', { timeout: 60000 });
  await p.waitForTimeout(2500);
  log('after import: markers/clusters on map =', await markersOnMap(p));
  await shot(p, 'B1-loaded-from-file');
  // personal marker via long-press (right-click in desktop terms)
  await p.mouse.click(150, 300, { button: 'right' });
  await p.waitForTimeout(400);
  await shot(p, 'B2-longpress-menu', 100);
  await p.locator('.spot-pop [data-a="add"]').click();
  await p.locator('.pform [name=name]').fill('Car stash');
  await p.locator('.pform [name=custom]').fill('Stashes');
  await p.locator('.pform [name=note]').fill('Spare Sentinel here');
  await shot(p, 'B3-personal-form', 200);
  await p.locator('.pform [type=submit]').click();
  await shot(p, 'B4-personal-card', 1500);
  log('personal:', await p.evaluate(() => window.__leonida ? 'dev' : document.querySelectorAll('.pin-user').length + ' personal pin(s)'));
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: 'Menu' }).click();
  await p.locator('[data-go="mymap"]').click();
  await shot(p, 'B5-mymap', 700);
  // backup import from run A
  if (fs.existsSync(`${out}/backup.json`)) {
    await p.keyboard.press('Escape');
    await p.getByRole('button', { name: 'Menu' }).click();
    await p.locator('[data-go="settings"]').click();
    await p.waitForTimeout(500);
    await p.locator('#settings .backup-file').setInputFiles(`${out}/backup.json`);
    await p.locator('.modal [data-r="ok"]').click({ timeout: 10000 });
    await p.locator('.toast', { hasText: 'Imported' }).waitFor({ timeout: 5000 }).catch(() => {});
    log('backup import toast:', await p.locator('.toast').allInnerTexts().catch(() => 'page reloaded'));
    await p.waitForEvent('load', { timeout: 10000 }).catch(() => {});
  }
  // coordinate picker
  await p.goto(APP, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2000);
  await p.getByRole('button', { name: 'Menu' }).click();
  await p.locator('[data-go="settings"]').click();
  await p.waitForTimeout(500);
  await p.locator('#settings .coord').check();
  await p.locator('#settings .sheet-close').click();
  await p.waitForTimeout(500);
  await p.mouse.click(200, 250);
  await shot(p, 'B6-coord-picker', 500);
  log('coords popup:', await p.locator('.spot-xy').allInnerTexts());
  await ctx.close();
}
await b.close();
