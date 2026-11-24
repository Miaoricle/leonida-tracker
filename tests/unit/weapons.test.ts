import { describe, it, expect } from 'vitest';
import { queryWeapons, matchWeaponMarkers, weaponCounts, type Weapon } from '../../src/data/weapons';

// synthetic test weapons (not GTABase data)
const w = (o: Partial<Weapon> & { name: string }): Weapon => ({ id: o.name, slug: o.name.toLowerCase().replace(/ /g, '-'), url: `u/${o.name}`, ...o });
const all = [
  w({ name: 'Alpha Pistol', class: 'Handguns', manufacturer: 'Acme', type: 'Base Weapon', price: 1200, stats: { Damage: 4, Accuracy: 7 } }),
  w({ name: 'Bravo Rifle', class: 'Assault Rifles', manufacturer: 'Zeta', type: 'Base Weapon', price: 5000, stats: { Damage: 6.8, Accuracy: 5 } }),
  w({ name: 'Golden Alpha', class: 'Handguns', manufacturer: 'Acme', type: 'Unique Variant', stats: { Damage: 4.5 }, mapIds: ['shooting-range-001', 'gone-999'] }),
];

describe('weapons', () => {
  it('sorts by damage, cheapest first with unpriced last', () => {
    expect(queryWeapons(all, { sort: 'damage' }).map((x) => x.name)).toEqual(['Bravo Rifle', 'Golden Alpha', 'Alpha Pistol']);
    expect(queryWeapons(all, { sort: 'price-asc' }).map((x) => x.name)).toEqual(['Alpha Pistol', 'Bravo Rifle', 'Golden Alpha']);
  });
  it('filters by class, base/unique and text', () => {
    expect(queryWeapons(all, { sort: 'name', cls: 'Handguns' }).length).toBe(2);
    expect(queryWeapons(all, { sort: 'name', type: 'unique' }).map((x) => x.name)).toEqual(['Golden Alpha']);
    expect(queryWeapons(all, { sort: 'name', type: 'base' }).length).toBe(2);
    expect(queryWeapons(all, { sort: 'name', text: 'zeta' }).map((x) => x.name)).toEqual(['Bravo Rifle']);
    expect(weaponCounts(all).classes).toEqual([['Assault Rifles', 1], ['Handguns', 2]]);
  });
  it('links map markers from the weapon page (existing ones only) and by name', () => {
    const ms = [
      { id: 'shooting-range-001', name: 'Griffin Shooting Range', category: 'shooting-range' },
      { id: 'unique-weapon-001', name: 'Bravo Rifle (rooftop)', category: 'unique-weapon' },
      { id: 'bar-001', name: 'Bravo Rifle Bar', category: 'bar' },
    ];
    const r = matchWeaponMarkers(all, ms);
    expect(r.get('Golden Alpha')).toEqual(['shooting-range-001']);
    expect(r.get('Bravo Rifle')).toEqual(['unique-weapon-001']);
    expect(r.has('Alpha Pistol')).toBe(false);
  });
});
