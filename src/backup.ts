// Backup of personal data: profiles, progress, notes, favourites, personal markers (photos inlined as data URLs).
// One versioned JSON. Import validates everything first, then merges in a single IndexedDB transaction
// (all or nothing): newer found/notes win, nothing is deleted.
import { db, getSetting, setSetting, type Favourite, type Note, type PersonalMarker, type Profile, type Progress } from './db';
import { MAX_PROFILES } from './state/progress';

export const BACKUP_APP = 'leonida-tracker';
export const BACKUP_VERSION = 1;

type PersonalOut = Omit<PersonalMarker, 'photo'> & { photo?: string };
export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  profiles: Profile[];
  progress: Progress[];
  notes: Note[];
  favourites: Favourite[];
  personal: PersonalOut[];
  settings?: { activeProfile?: string };
}

const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(b); });
async function dataUrlToBlob(u: string): Promise<Blob> { return (await fetch(u)).blob(); }

export async function exportBackup(): Promise<Backup> {
  const [profiles, progress, notes, favourites, personal] = await Promise.all([
    db.profiles.toArray(), db.progress.toArray(), db.notes.toArray(), db.favourites.toArray(), db.personal.toArray(),
  ]);
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profiles,
    progress: progress.filter((p) => p.found),
    notes,
    favourites,
    personal: await Promise.all(personal.map(async ({ photo, ...m }) => ({ ...m, ...(photo ? { photo: await blobToDataUrl(photo) } : {}) }))),
    settings: { activeProfile: await getSetting('activeProfile', undefined) },
  };
}

export class BackupError extends Error {}

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const arr = (v: unknown, name: string): unknown[] => { if (!Array.isArray(v)) throw new BackupError(`Backup is missing "${name}"`); return v; };

/** Validate a parsed backup file. Throws BackupError with a readable message. */
export function parseBackup(raw: unknown): Backup {
  if (!raw || typeof raw !== 'object') throw new BackupError('Not a backup file');
  const b = raw as Record<string, unknown>;
  if (b.app !== BACKUP_APP) throw new BackupError('This file isn\'t a Leonida Tracker backup');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) throw new BackupError(`Backup version ${String(b.version)} is newer than this app. Update the app first.`);
  const profiles = arr(b.profiles, 'profiles').map((p) => {
    const o = p as Profile;
    if (!str(o?.id) || !str(o?.name)) throw new BackupError('A profile is missing its id or name');
    return { id: o.id, name: o.name, createdAt: str(o.createdAt) ? o.createdAt : new Date().toISOString() };
  });
  const ids = new Set(profiles.map((p) => p.id));
  const own = <T extends { profileId: string; markerId: string }>(list: unknown[], name: string): T[] => list.map((x) => {
    const o = x as T;
    if (!str(o?.profileId) || !str(o?.markerId)) throw new BackupError(`An entry in "${name}" is invalid`);
    if (!ids.has(o.profileId)) throw new BackupError(`"${name}" refers to an unknown profile`);
    return o;
  });
  const progress = own<Progress>(arr(b.progress, 'progress'), 'progress').map((p) => ({ profileId: p.profileId, markerId: p.markerId, found: p.found !== false, foundAt: str(p.foundAt) ? p.foundAt : new Date(0).toISOString() }));
  const notes = own<Note>(arr(b.notes, 'notes'), 'notes').filter((n) => typeof n.text === 'string').map((n) => ({ profileId: n.profileId, markerId: n.markerId, text: n.text, updatedAt: str(n.updatedAt) ? n.updatedAt : new Date(0).toISOString() }));
  const favourites = own<Favourite>(arr(b.favourites, 'favourites'), 'favourites').map((f) => ({ profileId: f.profileId, markerId: f.markerId, addedAt: str(f.addedAt) ? f.addedAt : new Date(0).toISOString() }));
  const personal = arr(b.personal ?? [], 'personal').map((x) => {
    const m = x as PersonalOut;
    if (!str(m?.id) || !str(m?.profileId) || !Number.isFinite(m.x) || !Number.isFinite(m.y) || !str(m.name)) throw new BackupError('A personal marker is invalid');
    if (m.photo !== undefined && !(typeof m.photo === 'string' && m.photo.startsWith('data:image/'))) throw new BackupError('A personal marker photo is invalid');
    return { ...m, source: 'user' as const };
  });
  const s = b.settings as Backup['settings'];
  return { app: BACKUP_APP, version: b.version, exportedAt: str(b.exportedAt) ? b.exportedAt : '', profiles, progress, notes, favourites, personal, settings: s && typeof s === 'object' ? { activeProfile: str(s.activeProfile) ? s.activeProfile : undefined } : undefined };
}

export interface MergeResult { profiles: number; found: number; notes: number; favourites: number; personal: number }

/** Merge a validated backup into this device, atomically. */
export async function importBackup(b: Backup): Promise<MergeResult> {
  const personal = await Promise.all(b.personal.map(async ({ photo, ...m }) => ({ ...m, ...(photo ? { photo: await dataUrlToBlob(photo) } : {}) }) as PersonalMarker));
  const res: MergeResult = { profiles: 0, found: 0, notes: 0, favourites: 0, personal: 0 };
  await db.transaction('rw', [db.profiles, db.progress, db.notes, db.favourites, db.personal], async () => {
    const existing = await db.profiles.toArray();
    const newProfiles = b.profiles.filter((p) => !existing.some((e) => e.id === p.id));
    if (existing.length + newProfiles.length > MAX_PROFILES) throw new BackupError(`Importing would make ${existing.length + newProfiles.length} profiles (max ${MAX_PROFILES}). Delete a profile first.`);
    await db.profiles.bulkPut(newProfiles);
    res.profiles = newProfiles.length;
    for (const p of b.progress) {
      const cur = await db.progress.get([p.profileId, p.markerId]);
      if (!cur || cur.foundAt < p.foundAt) { await db.progress.put(p); if (!cur) res.found++; }
    }
    for (const n of b.notes) {
      const cur = await db.notes.get([n.profileId, n.markerId]);
      if (!cur || cur.updatedAt < n.updatedAt) { await db.notes.put(n); res.notes++; }
    }
    for (const f of b.favourites) {
      if (!(await db.favourites.get([f.profileId, f.markerId]))) { await db.favourites.put(f); res.favourites++; }
    }
    for (const m of personal) {
      if (!(await db.personal.get(m.id))) res.personal++;
      await db.personal.put(m);
    }
  });
  return res;
}

export async function markBackedUp() { await setSetting('backup.lastAt', new Date().toISOString()); }

/**
 * Show the reminder when there's something to lose and it's been 7 days without a backup, counted from the last
 * backup or, if there's never been one, from when progress first appeared. At most once a day.
 */
export async function backupReminderDue(hasProgress: boolean, now = Date.now()): Promise<boolean> {
  if (!hasProgress) return false;
  const day = 864e5;
  let since = await getSetting<string>('backup.lastAt', '');
  if (!since) {
    since = await getSetting<string>('backup.firstProgressAt', '');
    if (!since) { await setSetting('backup.firstProgressAt', new Date(now).toISOString()); return false; }
  }
  if (now - Date.parse(since) < 7 * day) return false;
  const nagged = await getSetting<string>('backup.remindedAt', '');
  if (nagged && now - Date.parse(nagged) < day) return false;
  await setSetting('backup.remindedAt', new Date(now).toISOString());
  return true;
}

/** Save a JSON file: share sheet on iOS ("Save to Files"), download link elsewhere. */
export async function saveJsonFile(name: string, data: unknown): Promise<void> {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if ((e as Error).name === 'AbortError') throw e; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
