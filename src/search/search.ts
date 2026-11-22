// Fuzzy, accent-insensitive search over markers, categories and places.
import type { Category, Label, Marker } from '../data/types';

/** Lower-case, strip accents and punctuation: "Fútbol 'n' Café" -> "futbol n cafe". */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Score how well query q matches text t (both normalized). Higher is better, 0 = no match.
 * Exact > prefix > word-prefix > substring > in-order subsequence (typo-tolerant-ish, e.g. "hdn pkg").
 */
export function score(q: string, t: string): number {
  if (!q) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - Math.min(t.length - q.length, 200);
  const words = q.split(' ');
  const tw = t.split(' ');
  // every query word must prefix some word in t
  if (words.every((w) => tw.some((x) => x.startsWith(w)))) return 600 - Math.min(t.length, 200);
  const i = t.indexOf(q);
  if (i >= 0) return 400 - i;
  // subsequence match with gap penalty
  let ti = 0, gaps = 0, last = -1;
  for (const ch of q.replace(/ /g, '')) {
    const j = t.indexOf(ch, ti);
    if (j < 0) return 0;
    if (last >= 0) gaps += j - last - 1;
    last = j; ti = j + 1;
  }
  const s = 200 - gaps * 4;
  return s > 40 ? s : 0;
}

export type Hit =
  | { type: 'marker'; score: number; marker: Marker; category?: Category }
  | { type: 'category'; score: number; category: Category }
  | { type: 'place'; score: number; label: Label };

export interface SearchIndex {
  markers: { m: Marker; n: string; c: string }[];
  categories: { c: Category; n: string }[];
  places: { l: Label; n: string }[];
  catById: Map<string, Category>;
}

export function buildIndex(markers: Marker[], categories: Category[], labels: Label[]): SearchIndex {
  const catById = new Map(categories.map((c) => [c.id, c]));
  return {
    markers: markers.map((m) => ({ m, n: normalize(m.name), c: normalize(catById.get(m.category)?.name ?? '') })),
    categories: categories.filter((c) => c.count > 0).map((c) => ({ c, n: normalize(c.name) })),
    places: labels.map((l) => ({ l, n: normalize(l.name) })),
    catById,
  };
}

export interface Results { places: Hit[]; categories: Hit[]; markers: Hit[]; total: number }

export function search(idx: SearchIndex, query: string, limit = 40): Results {
  const q = normalize(query);
  const empty = { places: [], categories: [], markers: [], total: 0 };
  if (q.length < 1) return empty;
  const places: Hit[] = [], cats: Hit[] = [], marks: Hit[] = [];
  for (const p of idx.places) { const s = score(q, p.n); if (s) places.push({ type: 'place', score: s, label: p.l }); }
  for (const c of idx.categories) { const s = score(q, c.n); if (s) cats.push({ type: 'category', score: s, category: c.c }); }
  for (const x of idx.markers) {
    // name match dominates; "category + name" lets "card ratface" find a card marker
    const s = Math.max(score(q, x.n), score(q, `${x.c} ${x.n}`) * 0.7);
    if (s) marks.push({ type: 'marker', score: s, marker: x.m, category: idx.catById.get(x.m.category) });
  }
  const by = (a: Hit, b: Hit) => b.score - a.score;
  places.sort(by); cats.sort(by); marks.sort(by);
  return { places: places.slice(0, 8), categories: cats.slice(0, 8), markers: marks.slice(0, limit), total: places.length + cats.length + marks.length };
}
