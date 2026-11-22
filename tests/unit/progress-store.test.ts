import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/db';
import { ProgressStore, MAX_PROFILES, countByCategory } from '../../src/state/progress';
import type { Marker } from '../../src/data/types';

const mk = (id: string, category: string): Marker => ({ id, category, name: id, x: 0, y: 0 });

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('ProgressStore', () => {
  it('creates a default profile and persists found state', async () => {
    const a = new ProgressStore();
    await a.init();
    expect(a.profile.name).toBe('Playthrough 1');
    await a.setFound('safe-001', true);
    await a.setFound('safe-002', true);
    await a.setFound('safe-002', false);
    const b = new ProgressStore();
    await b.init();
    expect([...b.found]).toEqual(['safe-001']);
    expect(b.recent()[0].markerId).toBe('safe-001');
  });

  it('progress survives a re-sync by GTABase id; removed markers stay as orphans', async () => {
    const s = new ProgressStore();
    await s.init();
    await s.setFound('bank-001', true);
    await s.setFound('bank-002', true);
    const v1 = [mk('bank-001', 'bank'), mk('bank-002', 'bank')];
    expect(countByCategory(v1, s.found).get('bank')).toEqual({ found: 2, total: 2 });
    // next sync: bank-002 removed, bank-003 added, bank-001 moved to another category
    const v2 = [mk('bank-001', 'fence'), mk('bank-003', 'bank')];
    const reloaded = new ProgressStore();
    await reloaded.init();
    expect(countByCategory(v2, reloaded.found).get('bank')).toEqual({ found: 0, total: 1 });
    expect(countByCategory(v2, reloaded.found).get('fence')).toEqual({ found: 1, total: 1 });
    const ids = new Set(v2.map((m) => m.id));
    expect([...reloaded.found].filter((id) => !ids.has(id))).toEqual(['bank-002']); // orphan kept
  });

  it('resets one category or everything', async () => {
    const s = new ProgressStore();
    await s.init();
    for (const id of ['safe-001', 'safe-002', 'bank-001']) await s.setFound(id, true);
    expect(await s.reset(['safe-001', 'safe-002', 'safe-003'])).toBe(2);
    expect([...s.found]).toEqual(['bank-001']);
    await s.reset();
    expect(s.found.size).toBe(0);
    expect(await db.progress.count()).toBe(0);
  });

  it('keeps favourites and notes per profile; max 4 profiles; delete cascades', async () => {
    const s = new ProgressStore();
    await s.init();
    await s.setFavourite('bank-001', true);
    await s.setNote('bank-001', 'needs the drill');
    await s.setFound('bank-001', true);
    const p2 = await s.createProfile('Second run');
    await s.switchProfile(p2.id);
    expect(s.found.size).toBe(0);
    expect(s.isFavourite('bank-001')).toBe(false);
    expect(s.note('bank-001')).toBe('');
    await s.createProfile('');
    await s.createProfile('Four');
    expect(s.profiles).toHaveLength(MAX_PROFILES);
    await expect(s.createProfile('Five')).rejects.toThrow();
    await s.switchProfile('default');
    expect(s.note('bank-001')).toBe('needs the drill');
    expect(s.isFavourite('bank-001')).toBe(true);
    await s.deleteProfile('default');
    expect(s.profile.id).not.toBe('default');
    expect(await db.notes.count()).toBe(0);
    expect(await db.progress.count()).toBe(0);
  });
});
