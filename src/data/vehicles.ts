// GTA 6 vehicle database (from the private repo's data/vehicles.json, synced from GTABase).
import { db } from '../db';

export interface VehicleField { key: string; label: string; value?: string; items?: { name: string; url: string }[] }
export interface Vehicle {
  id: string;
  slug: string;
  name: string;
  url: string;
  thumbnail?: string;
  image?: string;
  class: string[];
  manufacturer?: string;
  seats?: number;
  speed?: number;
  asphaltOvr?: number;
  offroadOvr?: number;
  realLife?: string;
  standoutSet?: string;
  fields?: VehicleField[];
  stats?: Record<string, number>;
  description?: string;
  // "how to get" facts from GTABase's vehicle list (undefined = not known yet)
  canRegister?: string; // Yes | No
  security?: string; // Not Mentioned | Modern (May Need Key Cloner) | Advanced (Key Cloner)
  access?: string; // Key | Keyless (Key Cloner)
  tracker?: string; // None | Standard | Advanced | Military
  storage?: number;
  costToRegister?: number;
  costBand?: string; // "Under $5,000", "$5,000 - $10,000", …
}

export const STAT_NAMES = ['Speed', 'Acceleration', 'Asphalt Handling', 'Off-Road Handling', 'Strength'] as const;

export async function loadVehicles(): Promise<Vehicle[]> {
  const cached = (await db.dataCache.get('vehicles'))?.json as { vehicles?: Vehicle[] } | undefined;
  if (cached?.vehicles?.length) return cached.vehicles;
  if (import.meta.env.DEV) {
    const r = await fetch(`${import.meta.env.BASE_URL}dev-data/vehicles.json`).catch(() => null);
    if (r?.ok) return ((await r.json()) as { vehicles: Vehicle[] }).vehicles ?? [];
  }
  return [];
}

/** A field's text value by label (case-insensitive regex). */
export function field(v: Vehicle, label: RegExp): string | undefined {
  const f = v.fields?.find((x) => label.test(x.label));
  return f?.value ?? f?.items?.map((i) => i.name).join(', ');
}

/** "$14,250" -> 14250 */
export const money = (s?: string) => { const n = s ? Number(s.replace(/[^\d.]/g, '')) : NaN; return Number.isFinite(n) && n > 0 ? n : undefined; };

export const price = (v: Vehicle) => v.costToRegister || money(field(v, /cost to (register|buy)|^price|purchase/i));
export const sellValue = (v: Vehicle) => money(field(v, /sell value/i));
export const tracker = (v: Vehicle) => v.tracker ?? field(v, /tracker/i);
export const stat = (v: Vehicle, name: string) => v.stats?.[name] ?? (name === 'Speed' ? v.speed : undefined);

export type SortKey = 'speed' | 'acceleration' | 'asphalt' | 'offroad' | 'strength' | 'price-asc' | 'price-desc' | 'sell-desc' | 'name';
export const SORTS: [SortKey, string][] = [
  ['speed', 'Fastest'], ['acceleration', 'Best acceleration'], ['asphalt', 'Best handling'], ['offroad', 'Best off-road'],
  ['strength', 'Strongest'], ['price-asc', 'Cheapest to register'], ['price-desc', 'Most expensive'], ['sell-desc', 'Highest sell value'], ['name', 'Name A–Z'],
];
const SORT_STAT: Partial<Record<SortKey, string>> = { speed: 'Speed', acceleration: 'Acceleration', asphalt: 'Asphalt Handling', offroad: 'Off-Road Handling', strength: 'Strength' };

/** The number shown next to a vehicle for the current sort (and used to order it). */
export function sortValue(v: Vehicle, key: SortKey): number | undefined {
  if (SORT_STAT[key]) return stat(v, SORT_STAT[key]!);
  if (key === 'price-asc' || key === 'price-desc') return price(v);
  if (key === 'sell-desc') return sellValue(v);
  return undefined;
}

/** Filter value meaning "not known yet" (GTABase's "Unknown"). */
export const UNKNOWN = '__unknown';
/** The dropdown filters, in GTABase's order: query key, label, and how to read the value from a vehicle. */
export const FACETS = [
  ['maker', 'Manufacturer', (v: Vehicle) => v.manufacturer],
  ['standout', 'Standout set', (v: Vehicle) => v.standoutSet],
  ['canRegister', 'Can be registered', (v: Vehicle) => v.canRegister],
  ['security', 'Security', (v: Vehicle) => v.security],
  ['access', 'Access', (v: Vehicle) => v.access],
  ['tracker', 'Tracker', (v: Vehicle) => tracker(v)],
  ['storage', 'Storage', (v: Vehicle) => (v.storage === undefined ? undefined : String(v.storage))],
  ['costBand', 'Cost to register', (v: Vehicle) => v.costBand],
  ['cls', 'Vehicle class', (v: Vehicle) => v.class[0]],
] as const;
export type FacetKey = (typeof FACETS)[number][0];

export interface VehicleQuery {
  text?: string; realLife?: string; sort: SortKey; onMapOnly?: boolean; onMap?: (v: Vehicle) => boolean;
  maker?: string; standout?: string; canRegister?: string; security?: string; access?: string; tracker?: string; storage?: string; costBand?: string; cls?: string;
}

/** Pure: options for one dropdown (value + count), sorted sensibly; "Not known yet" last. */
export function facetOptions(all: Vehicle[], key: FacetKey): [string, number][] {
  const get = FACETS.find((f) => f[0] === key)![2];
  const m = new Map<string, number>();
  let unknown = 0;
  for (const v of all) {
    if (key === 'cls') { for (const c of v.class) m.set(c, (m.get(c) ?? 0) + 1); continue; }
    const x = get(v);
    if (x === undefined || x === '') unknown++; else m.set(x, (m.get(x) ?? 0) + 1);
  }
  // numeric order for numbers and money bands ("Under $5,000" first, "$5,000 - $10,000" by its first number)
  const lead = (s: string) => { if (/^under/i.test(s)) return -1; const m = s.match(/[\d,.]+/); return m ? Number(m[0].replace(/,/g, '')) : NaN; };
  const out = [...m].sort((a, b) => {
    const x = lead(a[0]), y = lead(b[0]);
    return !Number.isNaN(x) && !Number.isNaN(y) ? x - y : a[0].localeCompare(b[0]);
  });
  if (key === 'standout') return [['__none', all.length - [...m.values()].reduce((p, c) => p + c, 0)], ['__any', [...m.values()].reduce((p, c) => p + c, 0)], ...out];
  return unknown && key !== 'cls' && key !== 'maker' ? [...out, [UNKNOWN, unknown]] : out;
}

function facetMatch(v: Vehicle, key: FacetKey, want: string | undefined): boolean {
  if (!want) return true;
  if (key === 'cls') return v.class.includes(want);
  const x = FACETS.find((f) => f[0] === key)![2](v);
  if (key === 'standout' && want === '__none') return !x;
  if (key === 'standout' && want === '__any') return !!x;
  if (want === UNKNOWN) return x === undefined || x === '';
  return x === want;
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Pure: filter + sort. Vehicles without a value for the sort key go last (keeps "Cheapest" honest). */
export function queryVehicles(all: Vehicle[], q: VehicleQuery): Vehicle[] {
  const t = q.text ? norm(q.text.trim()) : '';
  const rl = q.realLife ? norm(q.realLife.trim()) : '';
  const out = all.filter((v) =>
    FACETS.every(([k]) => facetMatch(v, k, q[k])) &&
    (!q.onMapOnly || !!q.onMap?.(v)) &&
    (!t || norm(`${v.name} ${v.manufacturer ?? ''}`).includes(t)) &&
    (!rl || norm(v.realLife ?? field(v, /real life/i) ?? '').includes(rl)));
  if (q.sort === 'name') return out.sort((a, b) => a.name.localeCompare(b.name));
  const dir = q.sort === 'price-asc' ? 1 : -1;
  return out.sort((a, b) => {
    const x = sortValue(a, q.sort), y = sortValue(b, q.sort);
    if (x === undefined && y === undefined) return a.name.localeCompare(b.name);
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    return (x - y) * dir || a.name.localeCompare(b.name);
  });
}

export function counts(all: Vehicle[]) {
  const classes = new Map<string, number>(), makers = new Map<string, number>();
  for (const v of all) {
    for (const c of v.class) classes.set(c, (classes.get(c) ?? 0) + 1);
    if (v.manufacturer) makers.set(v.manufacturer, (makers.get(v.manufacturer) ?? 0) + 1);
  }
  const sorted = (m: Map<string, number>) => [...m].sort((a, b) => a[0].localeCompare(b[0]));
  return { classes: sorted(classes), makers: sorted(makers) };
}

// ---------- vehicles <-> map markers ----------
/** Map categories whose markers name a vehicle. */
export const VEHICLE_MARKER_CATS = ['standout-vehicle', 'vehicle-spawn', 'vehicle-request'];

/** "Annis '95 Hellion (Moses' request)" -> "annis hellion": no notes in brackets, no '95-style years, no accents/punctuation. */
export function vehicleKey(s: string): string {
  return s.replace(/\([^)]*\)/g, ' ').replace(/[’']\d{2}\b/g, ' ').replace(/[’']/g, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Pure: which vehicle each map marker shows. A marker matches the vehicle whose name (or maker + name) appears
 * in it as whole words; the longest such name wins ("Coquette D10" beats "Coquette"). Returns vehicle id -> marker ids.
 */
export function matchVehicleMarkers(vehicles: Vehicle[], markers: { id: string; name: string; category: string }[]): Map<string, string[]> {
  return matchNamedMarkers(vehicles, markers, VEHICLE_MARKER_CATS);
}

/** Generic name matcher (vehicles, weapons): item id -> ids of markers in `cats` that name it. */
export function matchNamedMarkers(items: { id: string; name: string; manufacturer?: string }[], markers: { id: string; name: string; category: string }[], cats: string[]): Map<string, string[]> {
  const keys: [string, string][] = [];
  for (const v of items) {
    for (const k of new Set([vehicleKey(v.name), v.manufacturer ? vehicleKey(`${v.manufacturer} ${v.name}`) : ''])) if (k.length >= 3) keys.push([k, v.id]);
  }
  keys.sort((a, b) => b[0].length - a[0].length);
  const out = new Map<string, string[]>();
  for (const m of markers) {
    if (!cats.includes(m.category)) continue;
    const mk = ` ${vehicleKey(m.name)} `;
    const hit = keys.find(([k]) => mk.includes(` ${k} `));
    if (hit) out.set(hit[1], [...(out.get(hit[1]) ?? []), m.id]);
  }
  return out;
}
