import { describe, it, expect } from 'vitest';
import { normalize, score, buildIndex, search } from '../../src/search/search';
import { countByCategory, countByGroup } from '../../src/state/progress';
import type { Category, Label, Marker } from '../../src/data/types';

const cat = (id: string, name: string, group: string, trackable = true): Category =>
  ({ id, name, group, trackable, color: '#000', icon: '', order: 0, count: 1 });
const categories = [
  cat('hidden-package', 'Hidden Package', 'collectibles'),
  cat('card-vice-city-club-de-futbol', 'Vice City Club De Fútbol', 'collectible-cards'),
  cat('atm', 'ATMs', 'local-places', false),
];
const mk = (id: string, category: string, name: string): Marker => ({ id, category, name, x: 0, y: 0 });
const markers = [
  mk('hidden-package-001', 'hidden-package', 'Hidden Package #1'),
  mk('hidden-package-002', 'hidden-package', 'Hidden Package #2'),
  mk('card-vice-city-club-de-futbol-001', 'card-vice-city-club-de-futbol', 'Café Card'),
  mk('atm-001', 'atm', 'ATM'),
];
const labels: Label[] = [{ name: 'Little Cuba', type: 'district', x: 1, y: 2 }];

describe('search', () => {
  it('normalizes accents, case and punctuation', () => {
    expect(normalize("Fútbol 'n' CAFÉ!")).toBe('futbol n cafe');
  });
  it('ranks exact > prefix > word prefix > substring > subsequence', () => {
    const t = 'hidden package';
    expect(score('hidden package', t)).toBeGreaterThan(score('hidden', t));
    expect(score('hidden', t)).toBeGreaterThan(score('pack', t));
    expect(score('pack', t)).toBeGreaterThan(score('den pac', t));
    expect(score('hdnpkg', t)).toBeGreaterThan(0);
    expect(score('zzz', t)).toBe(0);
  });
  it('is accent-insensitive and groups by type', () => {
    const idx = buildIndex(markers, categories, labels);
    const r = search(idx, 'futbol');
    expect(r.categories.map((h) => h.type === 'category' && h.category.id)).toEqual(['card-vice-city-club-de-futbol']);
    expect(search(idx, 'cafe').markers).toHaveLength(1);
    expect(search(idx, 'little cuba').places).toHaveLength(1);
    expect(search(idx, 'nothing like this').total).toBe(0);
  });
});

describe('progress counts', () => {
  it('counts found / total per category and per group (trackable only)', () => {
    const found = new Set(['hidden-package-002', 'atm-001', 'removed-marker-999']);
    const perCat = countByCategory(markers, found);
    expect(perCat.get('hidden-package')).toEqual({ found: 1, total: 2 });
    expect(perCat.get('atm')).toEqual({ found: 1, total: 1 });
    const perGroup = countByGroup(categories, perCat);
    expect(perGroup.get('collectibles')).toEqual({ found: 1, total: 2 });
    expect(perGroup.has('local-places')).toBe(false); // ATMs are count-only
  });
});
