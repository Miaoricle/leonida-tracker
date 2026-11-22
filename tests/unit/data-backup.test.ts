import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, getSetting } from '../../src/db';
import { validateDataset, DataError } from '../../src/data/validate';
import { writeCache, readCache, diffMarkers, type RemovedInfo } from '../../src/data/store';
import { readDataFiles } from '../../src/data/importfile';
import { exportBackup, parseBackup, importBackup, BackupError } from '../../src/backup';
import { ProgressStore } from '../../src/state/progress';

const cats = { groups: [{ id: 'robberies', name: 'Robberies', color: '#2e7d32' }], categories: [{ id: 'bank', name: 'Banks', group: 'robberies', trackable: true }] };
const mk = (id: string, name = id, category = 'bank') => ({ id, name, category, x: 1, y: '2' });

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

describe('validateDataset', () => {
  it('keeps valid markers, coerces numbers, skips bad ones and recounts categories', () => {
    const d = validateDataset({ markers: [mk('bank-001'), { id: 'x' }, { ...mk('bank-002'), x: 'abc' }, mk('bank-001'), mk('safe-001', 'Safe', 'safe')], categories: cats });
    expect(d.markers.map((m) => m.id)).toEqual(['bank-001', 'safe-001']);
    expect(d.markers[0].y).toBe(2);
    expect(d.skipped).toBe(3);
    expect(d.categories.find((c) => c.id === 'bank')!.count).toBe(1);
    expect(d.categories.find((c) => c.id === 'safe')!.group).toBe('other'); // unknown category kept under Other
  });
  it('rejects garbage', () => {
    expect(() => validateDataset({ markers: {}, categories: cats })).toThrow(DataError);
    expect(() => validateDataset({ markers: [mk('a')], categories: [] })).toThrow(DataError);
  });
});

describe('cache updates (ID-stable re-sync)', () => {
  it('first load, then diff: NEW ids, removed snapshot, progress kept', async () => {
    const r1 = await writeCache({ markers: [mk('bank-001'), mk('bank-002', 'Old name')], categories: cats }, { markers: 'W/"1"' }, 'github');
    expect(r1.status).toBe('first');
    const p = new ProgressStore(); await p.init();
    await p.setFound('bank-002', true);
    await p.setFound('bank-001', true);

    const r2 = await writeCache({ markers: [mk('bank-001', 'Renamed'), mk('bank-003')] }, { markers: 'W/"2"' }, 'github');
    expect(r2).toMatchObject({ status: 'updated', added: 1, removed: 1, renamed: 1, total: 2 });
    expect(await getSetting('data.newIds', [])).toEqual(['bank-003']);
    const removed = await getSetting<Record<string, RemovedInfo>>('data.removed', {});
    expect(removed['bank-002'].name).toBe('Old name');
    expect((await db.dataCache.get('markers'))!.etag).toBe('W/"2"');

    const ds = (await readCache())!;
    expect(ds.categories[0].name).toBe('Banks'); // categories kept from the first write
    const again = new ProgressStore(); await again.init();
    expect(again.isFound('bank-001')).toBe(true); // survives the re-sync by id
    expect(again.isFound('bank-002')).toBe(true); // orphan kept
  });
  it('diffMarkers', () => {
    const d = diffMarkers([mk('a'), mk('b')] as never, [mk('b', 'B2'), mk('c')] as never);
    expect(d.added).toEqual(['c']);
    expect(d.removed.map((m) => m.id)).toEqual(['a']);
    expect(d.renamed).toBe(1);
  });
});

describe('import data file', () => {
  it('recognises separate files and a combined bundle', async () => {
    const f = (name: string, v: unknown) => new File([JSON.stringify(v)], name, { type: 'application/json' });
    const sep = await readDataFiles([f('markers (1).json', [mk('a')]), f('categories.json', cats), f('labels.json', [{ name: 'Vice City', type: 'city', x: 1, y: 2 }])]);
    expect(Object.keys(sep).sort()).toEqual(['categories', 'labels', 'markers']);
    const combined = await readDataFiles([f('leonida.json', { markers: [mk('a')], categories: cats })]);
    expect(Array.isArray(combined.markers)).toBe(true);
  });
});

describe('backup', () => {
  it('round-trips and merges atomically (newer wins, nothing deleted)', async () => {
    const p = new ProgressStore(); await p.init();
    await p.setFound('bank-001', true);
    await p.setFavourite('bank-001', true);
    await p.setNote('bank-001', 'drill');
    await db.personal.put({ id: 'user-1', profileId: 'default', source: 'user', name: 'Stash', category: 'custom', customCategory: 'Stashes', x: 1, y: 2 });
    const b = JSON.parse(JSON.stringify(await exportBackup()));
    const parsed = parseBackup(b);
    expect(parsed.progress).toHaveLength(1);

    await Promise.all(db.tables.map((t) => t.clear()));
    const q = new ProgressStore(); await q.init(); // fresh device with its own default profile
    await q.setFound('bank-009', true);
    const r = await importBackup(parsed);
    expect(r).toMatchObject({ found: 1, notes: 1, favourites: 1, personal: 1, profiles: 0 });
    await q.reload();
    expect([...q.found].sort()).toEqual(['bank-001', 'bank-009']);
    expect(q.note('bank-001')).toBe('drill');
    expect((await db.personal.get('user-1'))!.customCategory).toBe('Stashes');
  });
  it('rejects wrong app, newer version and dangling references; leaves data untouched', async () => {
    expect(() => parseBackup({ app: 'other' })).toThrow(BackupError);
    expect(() => parseBackup({ app: 'leonida-tracker', version: 99 })).toThrow(/newer/);
    const bad = { app: 'leonida-tracker', version: 1, profiles: [{ id: 'a', name: 'A' }], progress: [{ profileId: 'zzz', markerId: 'm' }], notes: [], favourites: [] };
    expect(() => parseBackup(bad)).toThrow(/unknown profile/);
  });
  it('refuses to exceed 4 profiles (all or nothing)', async () => {
    const p = new ProgressStore(); await p.init();
    for (const n of ['b', 'c', 'd']) await p.createProfile(n);
    const b = parseBackup({ app: 'leonida-tracker', version: 1, exportedAt: '', profiles: [{ id: 'new', name: 'New' }], progress: [{ profileId: 'new', markerId: 'x', foundAt: '2026-01-01' }], notes: [], favourites: [], personal: [] });
    await expect(importBackup(b)).rejects.toThrow(/max 4/);
    expect(await db.progress.count()).toBe(0);
  });
});

describe('backup reminder', () => {
  it('waits 7 days from first progress, then reminds at most once a day; a backup resets it', async () => {
    const { backupReminderDue, markBackedUp } = await import('../../src/backup');
    const t0 = Date.now(), day = 864e5;
    expect(await backupReminderDue(false, t0)).toBe(false);
    expect(await backupReminderDue(true, t0)).toBe(false); // first progress: start the clock
    expect(await backupReminderDue(true, t0 + 6 * day)).toBe(false);
    expect(await backupReminderDue(true, t0 + 7 * day + 1)).toBe(true);
    expect(await backupReminderDue(true, t0 + 7 * day + 2)).toBe(false); // once a day
    await markBackedUp();
    expect(await backupReminderDue(true, Date.now() + 3 * day)).toBe(false);
  });
});
