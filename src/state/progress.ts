// Found-state for the active profile, kept in memory for instant counts and persisted to IndexedDB.
import { db, getSetting, setSetting, type Profile } from '../db';
import type { Category, Marker } from '../data/types';

type Listener = (markerId: string | null) => void;

export interface Counts { found: number; total: number }

/** Pure: found/total per category, over the markers that exist in the current dataset. */
export function countByCategory(markers: Marker[], found: Set<string>): Map<string, Counts> {
  const out = new Map<string, Counts>();
  for (const m of markers) {
    const c = out.get(m.category) ?? { found: 0, total: 0 };
    c.total++;
    if (found.has(m.id)) c.found++;
    out.set(m.category, c);
  }
  return out;
}

/** Pure: sum per group, only over trackable categories. */
export function countByGroup(categories: Category[], perCat: Map<string, Counts>): Map<string, Counts> {
  const out = new Map<string, Counts>();
  for (const c of categories) {
    if (!c.trackable) continue;
    const pc = perCat.get(c.id);
    if (!pc) continue;
    const g = out.get(c.group) ?? { found: 0, total: 0 };
    g.found += pc.found; g.total += pc.total;
    out.set(c.group, g);
  }
  return out;
}

export class ProgressStore {
  found = new Set<string>();
  profile!: Profile;
  private listeners = new Set<Listener>();

  async init(): Promise<void> {
    let profiles = await db.profiles.toArray();
    if (!profiles.length) {
      const p = { id: 'default', name: 'Playthrough 1', createdAt: new Date().toISOString() };
      await db.profiles.put(p);
      profiles = [p];
    }
    const activeId = await getSetting<string>('activeProfile', profiles[0].id);
    this.profile = profiles.find((p) => p.id === activeId) ?? profiles[0];
    await this.reload();
  }

  async reload(): Promise<void> {
    const rows = await db.progress.where('profileId').equals(this.profile.id).toArray();
    this.found = new Set(rows.filter((r) => r.found).map((r) => r.markerId));
    this.emit(null);
  }

  async switchProfile(p: Profile): Promise<void> {
    this.profile = p;
    await setSetting('activeProfile', p.id);
    await this.reload();
  }

  isFound = (id: string) => this.found.has(id);

  async setFound(id: string, found: boolean): Promise<void> {
    if (found) this.found.add(id); else this.found.delete(id);
    this.emit(id);
    await db.progress.put({ profileId: this.profile.id, markerId: id, found, foundAt: new Date().toISOString() });
  }

  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(id: string | null) { for (const l of this.listeners) l(id); }
}
