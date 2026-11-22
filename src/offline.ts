// "Download map for offline": prefetches the vendored tiles up to a chosen zoom straight into the service worker's
// "tiles" cache (the same cache the map reads with CacheFirst). Pause/resume, progress, MB estimate.
const CACHE = 'tiles';
const CONCURRENCY = 6;

export interface TileIndex { [z: string]: { bytes: number; count: number; rows: Record<string, [number, number][]> } }

let indexP: Promise<TileIndex> | null = null;
export function tileIndex(): Promise<TileIndex> {
  return (indexP ??= fetch(`${import.meta.env.BASE_URL}tiles/index.json`).then((r) => r.json()));
}

/** Pure: total tiles / bytes for zoom levels 0..maxZoom. */
export function estimate(idx: TileIndex, maxZoom: number): { count: number; bytes: number } {
  let count = 0, bytes = 0;
  for (const [z, v] of Object.entries(idx)) if (+z <= maxZoom) { count += v.count; bytes += v.bytes; }
  return { count, bytes };
}

/** Pure: every tile URL path for zoom levels 0..maxZoom, low zooms first. */
export function tileUrls(idx: TileIndex, maxZoom: number, base = import.meta.env.BASE_URL): string[] {
  const out: string[] = [];
  for (const z of Object.keys(idx).map(Number).sort((a, b) => a - b)) {
    if (z > maxZoom) continue;
    for (const [y, runs] of Object.entries(idx[z].rows)) for (const [a, b] of runs) for (let x = a; x <= b; x++) out.push(`${base}tiles/${z}/${z},${y},${x}.jpg`);
  }
  return out;
}

export interface DownloadState { running: boolean; done: number; total: number; failed: number; maxZoom: number }
type Listener = (s: DownloadState) => void;

export class OfflineDownloader {
  state: DownloadState = { running: false, done: 0, total: 0, failed: 0, maxZoom: 5 };
  private queue: string[] = [];
  private listeners = new Set<Listener>();
  private stopFlag = false;

  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { for (const l of this.listeners) l({ ...this.state }); }

  get supported() { return 'caches' in window; }

  /** Start (or resume) downloading up to maxZoom. Tiles already cached are skipped quickly. */
  async start(maxZoom: number) {
    if (this.state.running) return;
    const idx = await tileIndex();
    if (this.state.maxZoom !== maxZoom || !this.queue.length) {
      this.queue = tileUrls(idx, maxZoom);
      this.state = { running: false, done: 0, total: this.queue.length, failed: 0, maxZoom };
    }
    this.stopFlag = false;
    this.state.running = true;
    this.emit();
    const cache = await caches.open(CACHE);
    const worker = async () => {
      while (!this.stopFlag && this.queue.length) {
        const url = this.queue.shift()!;
        try {
          if (!(await cache.match(url))) {
            const r = await fetch(url);
            if (r.ok) await cache.put(url, r); else this.state.failed++;
          }
        } catch {
          if (!navigator.onLine) { this.queue.unshift(url); this.stopFlag = true; break; }
          this.state.failed++;
        }
        this.state.done++;
        if (this.state.done % 25 === 0 || !this.queue.length) this.emit();
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    this.state.running = false;
    this.emit();
  }

  pause() { this.stopFlag = true; }
}

export async function storageUsage(): Promise<{ usage: number; quota: number } | null> {
  const e = await navigator.storage?.estimate?.();
  return e && e.usage !== undefined && e.quota !== undefined ? { usage: e.usage, quota: e.quota } : null;
}

export async function cachedTileCount(): Promise<number> {
  if (!('caches' in window)) return 0;
  return (await (await caches.open(CACHE)).keys()).length;
}

export const mb = (b: number) => `${(b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB`;
