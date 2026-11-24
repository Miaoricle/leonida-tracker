import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const FIX = path.resolve('tests/fixtures');
const files = ['markers.json', 'categories.json', 'labels.json', 'meta.json', 'missions.json'].map((f) => path.join(FIX, f));

/** No-token path: first run opens Settings → import the data files → app reloads with the map. */
async function importFixture(page: Page) {
  await page.goto('./');
  await expect(page.locator('#settings')).toHaveAttribute('data-snap', 'full');
  await expect(page.getByText('No map data yet')).toBeVisible();
  const reloaded = page.waitForEvent('load');
  await page.locator('#settings input.data-file').setInputFiles(files);
  await reloaded;
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
}

test('no-token import path loads the map', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: 'More' }).click();
  await page.locator('[data-go="settings"]').click();
  await expect(page.locator('.status-line')).toContainText('12 locations');
  await expect(page.locator('.status-line')).toContainText('From an imported file');
});

test('Only "Hidden Package" → open marker → Found → reload → still found', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.locator('.cat[data-c="hidden-package"] .only').click();
  await expect(page).toHaveURL(/feature=hidden-packages/);
  await page.locator('.cat[data-c="hidden-package"] .next').click(); // opens the first unfound marker's card
  const card = page.locator('#card');
  await expect(card).toHaveAttribute('data-snap', 'half');
  await expect(card.locator('.sheet-title')).toHaveText('Test package A');
  await card.locator('.found-btn').click();
  await expect(card.locator('.found-btn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/m=test-hp-1/);
  await page.reload();
  await expect(page.locator('#card .sheet-title')).toHaveText('Test package A'); // ?m= reopens it
  await expect(page.locator('#card .found-btn')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#card .sheet-close').click();
  await page.getByRole('button', { name: 'Filters' }).click();
  await expect(page.locator('.cat[data-c="hidden-package"] .cat-count')).toHaveText('found 1 / 8');
});

test('?feature= and ?m= deep links', async ({ page }) => {
  await importFixture(page);
  await page.goto('./?feature=hidden-packages');
  await expect(page.locator('.cat[data-c="hidden-package"] .only')).toHaveText('All');
  await expect(page.locator('.cat[data-c="bank"] .cat-cb')).not.toBeChecked();
  await page.goto('./?m=test-bank-2');
  await expect(page.locator('#card .sheet-title')).toHaveText('Test bank 2');
  await expect(page.locator('#card .card-n')).toHaveText('#2 of 3');
  await page.goto('./?m=does-not-exist');
  await expect(page.getByText("That marker isn't in your data")).toBeVisible();
});

test('offline reload after first visit', async ({ page, context }) => {
  await importFixture(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // now controlled by the service worker
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.offline-chip')).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await page.getByRole('button', { name: 'Search' }).click();
  await page.keyboard.type('package c');
  await expect(page.locator('.hit').first()).toContainText('Test package C');
});

test('bottom bar: Missions tab → tick a mission → back to Map', async ({ page }) => {
  await importFixture(page);
  const nav = page.getByRole('navigation', { name: 'Sections' });
  await nav.getByRole('button', { name: 'Missions' }).click();
  const view = page.locator('.missions');
  await expect(view).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Missions' })).toHaveAttribute('aria-current', 'page');
  await expect(view.locator('.v-head h2')).toContainText('0/2');
  // no-spoilers mode (default): walkthrough hidden until completed or revealed
  await expect(view.locator('.ms-nospoil')).toBeVisible();
  await view.getByRole('button', { name: /Test Opening/ }).click();
  await expect(view.locator('.ms-spoilbox')).toBeVisible();
  await expect(view.locator('.ms-steps')).toHaveCount(0);
  await view.getByRole('button', { name: 'Show for this mission' }).click();
  await expect(view.locator('.ms-steps')).toBeVisible();
  await view.locator('.v-back').click();
  await view.getByRole('checkbox', { name: 'Test Opening done' }).click();
  await expect(view.locator('.v-head h2')).toContainText('1/2');
  await view.getByRole('button', { name: /Test Side Job/ }).click();
  await expect(view.locator('.ms-b.miss')).toBeVisible();
  await nav.getByRole('button', { name: 'Map' }).click();
  await expect(view).toBeHidden();
  await expect(nav.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await nav.getByRole('button', { name: 'Missions' }).click();
  await expect(view.locator('.v-head h2')).toContainText('1/2'); // tick survives a reload
});
