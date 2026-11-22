// Marker screenshots. GTABase only lets its own site display them (Cross-Origin-Resource-Policy: same-origin),
// so the sync copies them into the private leonida-data repo (data/images.json maps source URL -> repo path).
// The app fetches them through the GitHub API with your token, caches each one on the device (Cache Storage),
// and serves it from there afterwards, offline too.
import { db } from '../db';
import { fetchBlob } from './github';
import { repoConfig } from './store';

const CACHE = 'marker-shots';
const key = (repoPath: string) => `${location.origin}${import.meta.env.BASE_URL}__shots/${repoPath}`;
const urls = new Map<string, Promise<string | null>>();

/** Read fresh each time (one IndexedDB get) so a manifest from a newer update check applies immediately. */
async function getManifest(): Promise<Record<string, string>> {
  return ((await db.dataCache.get('images'))?.json as Record<string, string>) ?? {};
}

/** True if the private repo has a copy of this screenshot. */
export async function hasShot(sourceUrl?: string): Promise<boolean> {
  return !!sourceUrl && !!(await getManifest())[sourceUrl];
}

/**
 * Object URL for a marker screenshot (by its GTABase source URL), or null if it isn't available
 * (no copy in the repo, offline and not cached yet, or no token).
 */
export function shotUrl(sourceUrl?: string): Promise<string | null> {
  if (!sourceUrl) return Promise.resolve(null);
  let p = urls.get(sourceUrl);
  if (!p) {
    p = load(sourceUrl).catch((e) => { console.warn('screenshot', e); return null; });
    urls.set(sourceUrl, p);
    void p.then((u) => { if (!u) urls.delete(sourceUrl); }); // allow a retry later (e.g. back online)
  }
  return p;
}

async function load(sourceUrl: string): Promise<string | null> {
  const repoPath = (await getManifest())[sourceUrl];
  if (!repoPath) return null;
  const cache = 'caches' in window ? await caches.open(CACHE) : null;
  const hit = await cache?.match(key(repoPath));
  if (hit) return URL.createObjectURL(await hit.blob());
  if (!navigator.onLine) return null;
  const c = await repoConfig();
  if (!c) return null;
  const blob = await fetchBlob(c, repoPath);
  const type = repoPath.endsWith('.webp') ? 'image/webp' : repoPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const typed = new Blob([blob], { type }); // GitHub labels raw files application/octet-stream
  await cache?.put(key(repoPath), new Response(typed, { headers: { 'Content-Type': type } }));
  return URL.createObjectURL(typed);
}

/** Thumbnails listed in the manifest (the "-320" variants), for "download screenshots for offline". */
export async function thumbnailSources(): Promise<string[]> {
  return Object.keys(await getManifest()).filter((u) => /-320\.\w+$/.test(u));
}

/** Prefetch the given screenshots into the device cache, 4 at a time. Resolves with how many are now available. */
export async function prefetchShots(sources: string[], onProgress: (done: number, total: number) => void, signal?: { stop: boolean }): Promise<number> {
  let done = 0, ok = 0, i = 0;
  const worker = async () => {
    while (i < sources.length && !signal?.stop) {
      const u = sources[i++];
      const url = await shotUrl(u);
      if (url) { ok++; URL.revokeObjectURL(url); urls.delete(u); }
      onProgress(++done, sources.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return ok;
}
