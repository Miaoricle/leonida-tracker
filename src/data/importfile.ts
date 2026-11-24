// "Import data file" (no-token fallback): pick markers.json + categories.json (+ labels.json, meta.json) from the
// Files app, or a single combined JSON { markers, categories, labels?, meta? }.
import { DataError, validateDataset } from './validate';
import { writeCache, type UpdateResult } from './store';
import type { DataFile } from './github';

export async function readDataFiles(files: FileList | File[]): Promise<Partial<Record<DataFile, unknown>>> {
  const out: Partial<Record<DataFile, unknown>> = {};
  for (const f of Array.from(files)) {
    let json: unknown;
    try { json = JSON.parse(await f.text()); } catch { throw new DataError(`${f.name} isn't valid JSON`); }
    const name = f.name.toLowerCase().replace(/\s*\(\d+\)/, ''); // "markers (1).json" from repeated downloads
    if (json && typeof json === 'object' && !Array.isArray(json) && 'markers' in json && 'categories' in json) {
      const j = json as Record<string, unknown>;
      Object.assign(out, { markers: j.markers, categories: j.categories, labels: j.labels, meta: j.meta });
    } else if (name.startsWith('vehicles')) out.vehicles = json;
    else if (name.startsWith('icons')) out.icons = json;
    else if (name.startsWith('weapons')) out.weapons = json;
    else if (name.startsWith('missions')) out.missions = json;
    else if (name.startsWith('markers') || Array.isArray(json) && (json as { category?: unknown }[])[0]?.category !== undefined) out.markers = json;
    else if (name.startsWith('categories') || (json as { categories?: unknown })?.categories) out.categories = json;
    else if (name.startsWith('labels') || Array.isArray(json)) out.labels = json;
    else if (name.startsWith('meta')) out.meta = json;
  }
  return out;
}

export async function importDataFiles(files: FileList | File[]): Promise<UpdateResult & { skipped: number }> {
  const parsed = await readDataFiles(files);
  if (!parsed.markers) throw new DataError('Pick markers.json (and categories.json the first time)');
  // validate before touching the cache (categories may come from a previous import)
  const { db } = await import('../db');
  const cats = parsed.categories ?? (await db.dataCache.get('categories'))?.json;
  if (!cats) throw new DataError('Also pick categories.json (needed on the first import)');
  const v = validateDataset({ markers: parsed.markers, categories: cats, labels: parsed.labels, meta: parsed.meta });
  const res = await writeCache(parsed, {}, 'import');
  return { ...res, skipped: v.skipped };
}
