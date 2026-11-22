// Validation for map data coming from the private repo or an imported file. No dependency (keeps the bundle small).
import type { Category, Dataset, Group, Label, Marker, Meta } from './types';

export class DataError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

export function validateMarkers(raw: unknown): { markers: Marker[]; skipped: number } {
  if (!Array.isArray(raw)) throw new DataError('markers.json must be an array of markers');
  const seen = new Set<string>();
  const markers: Marker[] = [];
  let skipped = 0;
  for (const m of raw) {
    if (!isObj(m) || typeof m.id !== 'string' || !m.id || typeof m.category !== 'string' || seen.has(m.id)) { skipped++; continue; }
    const x = num(m.x), y = num(m.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) { skipped++; continue; }
    seen.add(m.id);
    markers.push({ ...m, id: m.id, category: m.category, x, y, name: typeof m.name === 'string' && m.name ? m.name : m.id, source: 'gtabase' } as Marker);
  }
  if (!markers.length) throw new DataError('No valid markers found');
  return { markers, skipped };
}

export function validateCategories(raw: unknown, markers: Marker[]): { groups: Group[]; categories: Category[] } {
  if (!isObj(raw) || !Array.isArray(raw.categories)) throw new DataError('categories.json must be { groups, categories }');
  const groups: Group[] = (Array.isArray(raw.groups) ? raw.groups : []).filter(isObj).map((g, i) => ({
    id: String(g.id), name: String(g.name ?? g.id), color: typeof g.color === 'string' ? g.color : '#607d8b', order: typeof g.order === 'number' ? g.order : i,
  }));
  const count = new Map<string, number>();
  for (const m of markers) count.set(m.category, (count.get(m.category) ?? 0) + 1);
  const categories: Category[] = raw.categories.filter(isObj).filter((c) => typeof c.id === 'string').map((c, i) => ({
    ...c,
    id: c.id as string,
    name: String(c.name ?? c.id),
    group: String(c.group ?? 'other'),
    icon: String(c.icon ?? ''),
    color: typeof c.color === 'string' ? c.color : groups.find((g) => g.id === c.group)?.color ?? '#607d8b',
    trackable: c.trackable !== false,
    order: typeof c.order === 'number' ? c.order : i,
    count: count.get(c.id as string) ?? 0, // always recount from the markers we actually have
  }) as Category);
  // categories that have markers but aren't listed: add them under "Other"
  for (const [id, n] of count) {
    if (!categories.some((c) => c.id === id)) categories.push({ id, name: id, group: 'other', icon: '', color: '#607d8b', trackable: true, order: categories.length, count: n });
  }
  if (categories.some((c) => c.group === 'other') && !groups.some((g) => g.id === 'other')) groups.push({ id: 'other', name: 'Other', color: '#607d8b', order: groups.length });
  return { groups, categories };
}

export function validateLabels(raw: unknown): Label[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).filter((l) => typeof l.name === 'string' && Number.isFinite(num(l.x)) && Number.isFinite(num(l.y)))
    .map((l) => ({ ...l, x: num(l.x), y: num(l.y) }) as Label);
}

export function validateMeta(raw: unknown, markers: Marker[], categories: Category[]): Meta {
  const m = isObj(raw) ? raw : {};
  return {
    ...m,
    syncedAt: typeof m.syncedAt === 'string' ? m.syncedAt : new Date().toISOString(),
    markerCount: markers.length,
    categoryCount: categories.length,
    source: typeof m.source === 'string' ? m.source : 'GTABase (personal use, owner permission)',
  } as Meta;
}

/** Build a dataset from the raw JSON of the four files (labels and meta optional). */
export function validateDataset(files: { markers: unknown; categories: unknown; labels?: unknown; meta?: unknown }): Dataset & { skipped: number } {
  const { markers, skipped } = validateMarkers(files.markers);
  const { groups, categories } = validateCategories(files.categories, markers);
  return { markers, groups, categories, labels: validateLabels(files.labels), meta: validateMeta(files.meta, markers, categories), skipped };
}
