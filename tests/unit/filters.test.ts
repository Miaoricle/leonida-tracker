import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { defaultFilters, toggleOnly, setCategory, setGroup, showAll, hideAll, visibleIds, sanitize, FilterStore, DEFAULT_FILTERS } from '../../src/state/filters';

const cats = [
  { id: 'bank', count: 22 },
  { id: 'hidden-package', count: 63 },
  { id: 'bus-stop', count: 276, hidden_default: true },
  { id: 'darts', count: 0 },
];
const all = ['bank', 'hidden-package', 'bus-stop'];

describe('filter logic', () => {
  it('hides GTABase hidden_default categories initially', () => {
    expect(visibleIds(defaultFilters(cats), all)).toEqual(['bank', 'hidden-package']);
  });
  it('Only shows one category; applying it again shows all', () => {
    const s1 = toggleOnly(DEFAULT_FILTERS, 'hidden-package', all);
    expect(visibleIds(s1, all)).toEqual(['hidden-package']);
    expect(s1.only).toBe('hidden-package');
    const s2 = toggleOnly(s1, 'hidden-package', all);
    expect(visibleIds(s2, all)).toEqual(all);
    expect(s2.only).toBeNull();
  });
  it('Only on another category switches to it', () => {
    const s = toggleOnly(toggleOnly(DEFAULT_FILTERS, 'bank', all), 'bus-stop', all);
    expect(visibleIds(s, all)).toEqual(['bus-stop']);
  });
  it('category / group / all toggles clear Only', () => {
    const o = toggleOnly(DEFAULT_FILTERS, 'bank', all);
    expect(setCategory(o, 'bus-stop', true).only).toBeNull();
    expect(visibleIds(setGroup(o, ['hidden-package', 'bus-stop'], true), all)).toEqual(all);
    expect(visibleIds(hideAll(o, all), all)).toEqual([]);
    expect(visibleIds(showAll(o), all)).toEqual(all);
  });
  it('sanitize rejects junk and keeps valid fields', () => {
    const fb = defaultFilters(cats);
    expect(sanitize(null, fb)).toEqual(fb);
    expect(sanitize({ hidden: ['x', 3], hideFound: 'yes', collapsed: ['g'] }, fb)).toEqual({ hidden: ['x'], hideFound: false, collapsed: ['g'], only: null });
  });
});

describe('filter persistence', () => {
  it('saves to IndexedDB and restores on next load', async () => {
    const a = await FilterStore.load(cats);
    expect(a.allIds).toEqual(all); // empty categories excluded
    a.update((s) => ({ ...toggleOnly(s, 'bank', a.allIds), hideFound: true, collapsed: ['robberies'] }));
    await new Promise((r) => setTimeout(r, 20));
    const b = await FilterStore.load(cats);
    expect(b.state).toEqual(a.state);
    expect(b.visible()).toEqual(['bank']);
    expect(b.state.hideFound).toBe(true);
  });
});
