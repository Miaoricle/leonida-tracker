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

export const MAX_PROFILES = 4;

/**
 * Per-profile user data: found markers (with time), favourites and notes. In-memory for instant UI, written
 * through to IndexedDB on every change. Progress rows are keyed by GTABase marker id, so they survive re-syncs;
 * rows for markers a later sync removed are kept (orphans) and listed in Settings → Removed markers.
 */
export class ProgressStore {
  found = new Set<string>();
  foundAt = new Map<string, string>();
  favourites = new Set<string>();
  notes = new Map<string, string>();
  profile!: Profile;
  profiles: Profile[] = [];
  private listeners = new Set<Listener>();

  async init(): Promise<void> {
    this.profiles = (await db.profiles.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!this.profiles.length) {
      const p = { id: 'default', name: 'Playthrough 1', createdAt: new Date().toISOString() };
      await db.profiles.put(p);
      this.profiles = [p];
    }
    const activeId = await getSetting<string>('activeProfile', this.profiles[0].id);
    this.profile = this.profiles.find((p) => p.id === activeId) ?? this.profiles[0];
    await this.reload();
  }

  async reload(): Promise<void> {
    const pid = this.profile.id;
    const [rows, favs, notes] = await Promise.all([
      db.progress.where('profileId').equals(pid).toArray(),
      db.favourites.where('profileId').equals(pid).toArray(),
      db.notes.where('profileId').equals(pid).toArray(),
    ]);
    const found = rows.filter((r) => r.found);
    this.found = new Set(found.map((r) => r.markerId));
    this.foundAt = new Map(found.map((r) => [r.markerId, r.foundAt]));
    this.favourites = new Set(favs.map((f) => f.markerId));
    this.notes = new Map(notes.filter((n) => n.text).map((n) => [n.markerId, n.text]));
    this.emit(null);
  }

  // ---------- found ----------
  isFound = (id: string) => this.found.has(id);

  async setFound(id: string, found: boolean): Promise<void> {
    const at = new Date().toISOString();
    if (found) { this.found.add(id); this.foundAt.set(id, at); } else { this.found.delete(id); this.foundAt.delete(id); }
    this.emit(id);
    if (found) await db.progress.put({ profileId: this.profile.id, markerId: id, found: true, foundAt: at });
    else await db.progress.delete([this.profile.id, id]);
  }

  /** Most recent finds first. */
  recent(limit = 10): { markerId: string; foundAt: string }[] {
    return [...this.foundAt].map(([markerId, foundAt]) => ({ markerId, foundAt }))
      .sort((a, b) => b.foundAt.localeCompare(a.foundAt)).slice(0, limit);
  }

  /** Reset found state for the given marker ids, or everything in this profile when ids is omitted. */
  async reset(ids?: string[]): Promise<number> {
    const pid = this.profile.id;
    let n: number;
    if (!ids) n = await db.progress.where('profileId').equals(pid).delete();
    else { const keys = ids.filter((id) => this.found.has(id)).map((id) => [pid, id] as [string, string]); await db.progress.bulkDelete(keys); n = keys.length; }
    await this.reload();
    return n;
  }

  // ---------- favourites & notes ----------
  isFavourite = (id: string) => this.favourites.has(id);

  async setFavourite(id: string, on: boolean): Promise<void> {
    if (on) this.favourites.add(id); else this.favourites.delete(id);
    this.emit(id);
    if (on) await db.favourites.put({ profileId: this.profile.id, markerId: id, addedAt: new Date().toISOString() });
    else await db.favourites.delete([this.profile.id, id]);
  }

  note = (id: string) => this.notes.get(id) ?? '';

  async setNote(id: string, text: string): Promise<void> {
    const t = text.trim();
    if (t) this.notes.set(id, text); else this.notes.delete(id);
    if (t) await db.notes.put({ profileId: this.profile.id, markerId: id, text, updatedAt: new Date().toISOString() });
    else await db.notes.delete([this.profile.id, id]);
  }

  // ---------- profiles ----------
  async switchProfile(id: string): Promise<void> {
    const p = this.profiles.find((x) => x.id === id);
    if (!p) return;
    this.profile = p;
    await setSetting('activeProfile', p.id);
    await this.reload();
  }

  async createProfile(name: string): Promise<Profile> {
    if (this.profiles.length >= MAX_PROFILES) throw new Error(`Up to ${MAX_PROFILES} profiles`);
    const p: Profile = { id: `p-${Date.now().toString(36)}`, name: name.trim() || `Playthrough ${this.profiles.length + 1}`, createdAt: new Date().toISOString() };
    await db.profiles.put(p);
    this.profiles.push(p);
    return p;
  }

  async renameProfile(id: string, name: string): Promise<void> {
    const p = this.profiles.find((x) => x.id === id);
    if (!p || !name.trim()) return;
    p.name = name.trim();
    await db.profiles.put(p);
    this.emit(null);
  }

  /** Deletes a profile and all its progress, favourites and notes. The last profile can't be deleted. */
  async deleteProfile(id: string): Promise<void> {
    if (this.profiles.length <= 1) throw new Error("Can't delete the only profile");
    await db.transaction('rw', db.profiles, db.progress, db.favourites, db.notes, async () => {
      await db.progress.where('profileId').equals(id).delete();
      await db.favourites.where('profileId').equals(id).delete();
      await db.notes.where('profileId').equals(id).delete();
      await db.profiles.delete(id);
    });
    this.profiles = this.profiles.filter((p) => p.id !== id);
    if (this.profile.id === id) await this.switchProfile(this.profiles[0].id);
  }

  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(id: string | null) { for (const l of this.listeners) l(id); }
}
