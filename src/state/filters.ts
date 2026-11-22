// Filter state: which categories are visible, whether found markers are hidden, which groups are collapsed.
// Pure functions (unit-tested) + a persisted store.
import { getSetting, setSetting } from '../db';

export interface FilterState {
  hidden: string[]; // hidden category ids (stored as "hidden" so new categories show up by default)
  hideFound: boolean;
  collapsed: string[]; // collapsed group ids
  only: string | null; // category currently shown with "Only"
}

export const DEFAULT_FILTERS: FilterState = { hidden: [], hideFound: false, collapsed: [], only: null };

/** Initial hidden set: GTABase's hidden_default categories (bus stops, ATMs, EV chargers, gas stations...). */
export function defaultFilters(categories: { id: string; hidden_default?: boolean }[]): FilterState {
  return { ...DEFAULT_FILTERS, hidden: categories.filter((c) => c.hidden_default).map((c) => c.id) };
}

export const isVisible = (s: FilterState, id: string) => !s.hidden.includes(id);

export function visibleIds(s: FilterState, all: string[]): string[] {
  const h = new Set(s.hidden);
  return all.filter((id) => !h.has(id));
}

export function setCategory(s: FilterState, id: string, visible: boolean): FilterState {
  const h = new Set(s.hidden);
  if (visible) h.delete(id); else h.add(id);
  return { ...s, hidden: [...h], only: null };
}

export function setGroup(s: FilterState, ids: string[], visible: boolean): FilterState {
  const h = new Set(s.hidden);
  for (const id of ids) if (visible) h.delete(id); else h.add(id);
  return { ...s, hidden: [...h], only: null };
}

export const showAll = (s: FilterState): FilterState => ({ ...s, hidden: [], only: null });
export const hideAll = (s: FilterState, all: string[]): FilterState => ({ ...s, hidden: [...all], only: null });

/** "Only": show just this category. Applying it again to the same category shows all ("All"). */
export function toggleOnly(s: FilterState, id: string, all: string[]): FilterState {
  if (s.only === id) return showAll(s);
  return { ...s, hidden: all.filter((x) => x !== id), only: id };
}

export function toggleCollapsed(s: FilterState, groupId: string): FilterState {
  const c = new Set(s.collapsed);
  if (c.has(groupId)) c.delete(groupId); else c.add(groupId);
  return { ...s, collapsed: [...c] };
}

export function sanitize(raw: unknown, fallback: FilterState): FilterState {
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Partial<FilterState>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    hidden: Array.isArray(r.hidden) ? arr(r.hidden) : fallback.hidden,
    hideFound: typeof r.hideFound === 'boolean' ? r.hideFound : fallback.hideFound,
    collapsed: arr(r.collapsed),
    only: typeof r.only === 'string' ? r.only : null,
  };
}

const KEY = 'filters';
type Listener = (s: FilterState) => void;

export class FilterStore {
  private listeners = new Set<Listener>();
  constructor(public state: FilterState, public readonly allIds: string[]) {}

  static async load(categories: { id: string; hidden_default?: boolean; count: number }[]): Promise<FilterStore> {
    const ids = categories.filter((c) => c.count > 0).map((c) => c.id);
    const fallback = defaultFilters(categories);
    return new FilterStore(sanitize(await getSetting(KEY, null), fallback), ids);
  }

  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  update(fn: (s: FilterState) => FilterState) {
    this.state = fn(this.state);
    void setSetting(KEY, this.state);
    for (const l of this.listeners) l(this.state);
  }

  visible(): string[] { return visibleIds(this.state, this.allIds); }
}
