// Map data cache (IndexedDB) + update bookkeeping: "NEW" markers since the last sync and a snapshot of
// removed markers (so ticked-but-removed markers still have a name in Settings → Removed markers).
import { db, getSetting, setSetting } from '../db';
import type { Dataset, Marker } from './types';
import { validateDataset } from './validate';
import { DATA_FILES, fetchFile, DEFAULT_REPO, type DataFile, type RepoConfig } from './github';

export interface RemovedInfo { name: string; category: string; removedAt: string }
export interface UpdateResult { status: 'unchanged' | 'updated' | 'first'; added: number; removed: number; renamed: number; total: number; imagesUpdated?: boolean }

export async function readCache(): Promise<Dataset | null> {
  try {
    const rows = await db.dataCache.bulkGet(['markers', 'categories', 'labels', 'meta']);
    const [m, c, l, meta] = rows;
    if (!m || !c) return null;
    return validateDataset({ markers: m.json, categories: c.json, labels: l?.json, meta: meta?.json });
  } catch (e) {
    console.warn('cache unreadable', e);
    return null;
  }
}

/** Pure: what changed between two marker lists. */
export function diffMarkers(prev: Marker[], next: Marker[]) {
  const before = new Map(prev.map((m) => [m.id, m]));
  const nextIds = new Set(next.map((m) => m.id));
  const added = next.filter((m) => !before.has(m.id)).map((m) => m.id);
  const removed = prev.filter((m) => !nextIds.has(m.id));
  const renamed = next.filter((m) => before.has(m.id) && before.get(m.id)!.name !== m.name).length;
  return { added, removed, renamed };
}

/**
 * Store a new dataset (raw JSON per file + ETags). On a replace, remembers which markers are new (for the NEW
 * badge, until the next update) and snapshots removed ones.
 */
export async function writeCache(files: Partial<Record<DataFile, unknown>>, etags: Partial<Record<DataFile, string>>, source: 'github' | 'import'): Promise<UpdateResult> {
  const prevRow = await db.dataCache.get('markers');
  const merged = { ...Object.fromEntries((await db.dataCache.bulkGet([...DATA_FILES])).filter(Boolean).map((r) => [r!.key, r!.json])), ...files };
  const next = validateDataset({ markers: merged.markers, categories: merged.categories, labels: merged.labels, meta: merged.meta });
  const now = new Date().toISOString();
  let res: UpdateResult = { status: 'first', added: 0, removed: 0, renamed: 0, total: next.markers.length };
  if (prevRow) {
    const prev = validateDataset({ markers: prevRow.json, categories: merged.categories }).markers;
    const d = diffMarkers(prev, next.markers);
    res = { status: d.added.length || d.removed.length || d.renamed ? 'updated' : 'unchanged', added: d.added.length, removed: d.removed.length, renamed: d.renamed, total: next.markers.length };
    if (d.added.length || d.removed.length) await setSetting('data.newIds', d.added);
    if (d.removed.length) {
      const snap = await getSetting<Record<string, RemovedInfo>>('data.removed', {});
      for (const m of d.removed) snap[m.id] = { name: m.name, category: m.category, removedAt: now };
      await setSetting('data.removed', snap);
    }
  }
  await db.transaction('rw', db.dataCache, async () => {
    for (const [k, json] of Object.entries(files)) {
      await db.dataCache.put({ key: k as DataFile, json, etag: etags[k as DataFile], fetchedAt: now });
    }
  });
  await setSetting('data.source', source);
  await setSetting('data.lastSync', now);
  return res;
}

export async function repoConfig(): Promise<RepoConfig | null> {
  const token = await getSetting<string>('gh.token', '');
  if (!token) return null;
  const r = await getSetting('gh.repo', DEFAULT_REPO);
  return { ...DEFAULT_REPO, ...r, token };
}

/**
 * Check the private repo for new data. meta.json is fetched first with its ETag: an unchanged 304 means nothing
 * to do (and doesn't count against the API rate limit). Otherwise all four files are fetched (each with ETag).
 */
export async function checkForUpdates(c: RepoConfig): Promise<UpdateResult> {
  const etag = async (k: DataFile) => (await db.dataCache.get(k))?.etag;
  const hasData = !!(await db.dataCache.get('markers'));
  await setSetting('data.lastCheck', new Date().toISOString());
  const meta = await fetchFile(c, 'meta', hasData ? await etag('meta') : undefined);
  if (!meta && hasData) {
    // markers unchanged; screenshots and vehicles are synced separately, so check those too (cheap 304s)
    let side = false;
    for (const f of ['images', 'vehicles'] as const) {
      const r = await fetchFile(c, f, await etag(f)).catch(() => null);
      if (r) { side = true; await db.dataCache.put({ key: f, json: r.json, etag: r.etag, fetchedAt: new Date().toISOString() }); }
    }
    return { status: 'unchanged', added: 0, removed: 0, renamed: 0, total: (await readCache())?.markers.length ?? 0, imagesUpdated: side };
  }
  const files: Partial<Record<DataFile, unknown>> = {};
  const etags: Partial<Record<DataFile, string>> = {};
  if (meta) { files.meta = meta.json; etags.meta = meta.etag; }
  for (const f of ['markers', 'categories', 'labels', 'images', 'vehicles'] as const) {
    const r = await fetchFile(c, f, hasData ? await etag(f) : undefined);
    if (r) { files[f] = r.json; etags[f] = r.etag; }
  }
  return writeCache(files, etags, 'github');
}

/** True when an automatic check is due (online, has a token, last check > 24 h ago). */
export async function autoCheckDue(): Promise<boolean> {
  if (!navigator.onLine) return false;
  const last = await getSetting<string>('data.lastCheck', '');
  return !last || Date.now() - Date.parse(last) > 24 * 3600 * 1000;
}

export const describeUpdate = (r: UpdateResult) =>
  r.status === 'unchanged' ? 'Already up to date'
    : r.status === 'first' ? `Loaded ${r.total.toLocaleString()} locations`
      : `Updated: +${r.added} markers, −${r.removed}${r.renamed ? `, ${r.renamed} renamed` : ''}`;
