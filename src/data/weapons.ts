// GTA 6 weapon database (from the private repo's data/weapons.json, synced from GTABase).
import { db } from '../db';
import { matchNamedMarkers } from './vehicles';

export interface WeaponField { label: string; value?: string; items?: { name: string; url: string }[] }
export interface Weapon {
  id: string;
  slug: string;
  name: string;
  url: string;
  thumbnail?: string;
  image?: string;
  class?: string;
  manufacturer?: string;
  /** "Base Weapon" | "Unique Variant" */
  type?: string;
  price?: number;
  realLife?: string;
  stats?: Record<string, number>;
  fields?: WeaponField[];
  description?: string;
  /** "Sold only at Griffin Shooting Range" etc. */
  location?: string;
  /** GTABase map marker ids the weapon page links to */
  mapIds?: string[];
}

export const WEAPON_STATS = ['Damage', 'Accuracy', 'Handling', 'Range', 'Overall'] as const;
export const WEAPON_MARKER_CATS = ['unique-weapon', 'weapon-spawn'];

export async function loadWeapons(): Promise<Weapon[]> {
  const cached = (await db.dataCache.get('weapons'))?.json as { weapons?: Weapon[] } | undefined;
  if (cached?.weapons?.length) return cached.weapons;
  if (import.meta.env.DEV) {
    const r = await fetch(`${import.meta.env.BASE_URL}dev-data/weapons.json`).catch(() => null);
    if (r?.ok) return ((await r.json()) as { weapons: Weapon[] }).weapons ?? [];
  }
  return [];
}

export const wfield = (w: Weapon, label: RegExp): string | undefined => {
  const f = w.fields?.find((x) => label.test(x.label));
  return f?.value ?? f?.items?.map((i) => i.name).join(', ');
};
export const isUnique = (w: Weapon) => /unique/i.test(w.type ?? '');

export type WeaponSortKey = 'damage' | 'accuracy' | 'handling' | 'range' | 'overall' | 'price-asc' | 'price-desc' | 'name';
export const WEAPON_SORTS: [WeaponSortKey, string][] = [
  ['damage', 'Most damage'], ['accuracy', 'Most accurate'], ['handling', 'Best handling'], ['range', 'Longest range'], ['overall', 'Best overall'],
  ['price-asc', 'Cheapest'], ['price-desc', 'Most expensive'], ['name', 'Name A–Z'],
];
const SORT_STAT: Partial<Record<WeaponSortKey, string>> = { damage: 'Damage', accuracy: 'Accuracy', handling: 'Handling', range: 'Range', overall: 'Overall' };

export function weaponSortValue(w: Weapon, key: WeaponSortKey): number | undefined {
  if (SORT_STAT[key]) return w.stats?.[SORT_STAT[key]!];
  if (key === 'price-asc' || key === 'price-desc') return w.price || undefined;
  return undefined;
}

export interface WeaponQuery { text?: string; sort: WeaponSortKey; cls?: string; maker?: string; type?: 'all' | 'base' | 'unique' | 'onmap'; onMap?: (w: Weapon) => boolean }

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Pure: filter + sort. Weapons without a value for the sort key go last. */
export function queryWeapons(all: Weapon[], q: WeaponQuery): Weapon[] {
  const t = q.text ? norm(q.text.trim()) : '';
  const out = all.filter((w) =>
    (!q.cls || w.class === q.cls) &&
    (!q.maker || w.manufacturer === q.maker) &&
    (q.type !== 'base' || !isUnique(w)) &&
    (q.type !== 'unique' || isUnique(w)) &&
    (q.type !== 'onmap' || !!q.onMap?.(w)) &&
    (!t || norm(`${w.name} ${w.manufacturer ?? ''} ${w.realLife ?? ''} ${w.class ?? ''}`).includes(t)));
  if (q.sort === 'name') return out.sort((a, b) => a.name.localeCompare(b.name));
  const dir = q.sort === 'price-asc' ? 1 : -1;
  return out.sort((a, b) => {
    const x = weaponSortValue(a, q.sort), y = weaponSortValue(b, q.sort);
    if (x === undefined && y === undefined) return a.name.localeCompare(b.name);
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    return (x - y) * dir || a.name.localeCompare(b.name);
  });
}

export function weaponCounts(all: Weapon[]) {
  const classes = new Map<string, number>(), makers = new Map<string, number>();
  for (const w of all) {
    if (w.class) classes.set(w.class, (classes.get(w.class) ?? 0) + 1);
    if (w.manufacturer) makers.set(w.manufacturer, (makers.get(w.manufacturer) ?? 0) + 1);
  }
  const sorted = (m: Map<string, number>) => [...m].sort((a, b) => a[0].localeCompare(b[0]));
  return { classes: sorted(classes), makers: sorted(makers) };
}

/**
 * Pure: weapon id -> map marker ids. Uses the markers the GTABase weapon page links to (exact), plus unique-weapon /
 * weapon-spawn markers that name the weapon.
 */
export function matchWeaponMarkers(weapons: Weapon[], markers: { id: string; name: string; category: string }[]): Map<string, string[]> {
  const exists = new Set(markers.map((m) => m.id));
  const out = matchNamedMarkers(weapons, markers, WEAPON_MARKER_CATS);
  for (const w of weapons) {
    const linked = (w.mapIds ?? []).filter((id) => exists.has(id));
    if (linked.length) out.set(w.id, [...new Set([...linked, ...(out.get(w.id) ?? [])])]);
  }
  return out;
}
