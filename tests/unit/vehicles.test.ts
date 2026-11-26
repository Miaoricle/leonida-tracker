import { describe, it, expect } from 'vitest';
import { facetOptions, UNKNOWN, queryVehicles, price, sellValue, tracker, money, counts, matchVehicleMarkers, type Vehicle } from '../../src/data/vehicles';

// synthetic test vehicles (not GTABase data)
const v = (o: Partial<Vehicle> & { name: string }): Vehicle => ({ id: o.name, slug: o.name.toLowerCase(), url: `u/${o.name}`, class: ['Sports'], ...o });
const all = [
  v({ name: 'Alpha', manufacturer: 'Grotti', speed: 8.7, stats: { Speed: 8.7, Acceleration: 8 }, fields: [{ key: 'c', label: 'Cost To Register', value: '$14,250' }, { key: 't', label: 'Tracker', value: 'Standard' }] }),
  v({ name: 'Bravo', manufacturer: 'Annis', speed: 5.5, class: ['Coupes'], stats: { Speed: 5.5, Acceleration: 6.4 }, fields: [{ key: 'c', label: 'Cost To Register', value: '$9,000' }, { key: 's', label: 'Sell Value (Stolen)', value: '$4,235' }] }),
  v({ name: 'Charlie', manufacturer: 'Grotti', speed: 7, standoutSet: 'Stock Car' }),
  v({ name: 'Délta', manufacturer: 'Annis', class: ['Coupes'] }),
];

describe('vehicles', () => {
  it('parses money, price, sell value, tracker', () => {
    expect(money('$14,250')).toBe(14250);
    expect(money('Coming soon')).toBeUndefined();
    expect(price(all[0])).toBe(14250);
    expect(sellValue(all[1])).toBe(4235);
    expect(tracker(all[0])).toBe('Standard');
    expect(tracker(all[2])).toBeUndefined();
  });
  it('sorts by speed and puts unknown values last', () => {
    expect(queryVehicles(all, { sort: 'speed' }).map((x) => x.name)).toEqual(['Alpha', 'Charlie', 'Bravo', 'Délta']);
  });
  it('cheapest first, vehicles without a price at the end', () => {
    expect(queryVehicles(all, { sort: 'price-asc' }).map((x) => x.name)).toEqual(['Bravo', 'Alpha', 'Charlie', 'Délta']);
    expect(queryVehicles(all, { sort: 'price-desc' }).map((x) => x.name).slice(0, 2)).toEqual(['Alpha', 'Bravo']);
  });
  it('filters by class, maker, standout and accent-insensitive text', () => {
    expect(queryVehicles(all, { sort: 'name', cls: 'Coupes' }).map((x) => x.name)).toEqual(['Bravo', 'Délta']);
    expect(queryVehicles(all, { sort: 'name', maker: 'Grotti', standout: '__none' }).map((x) => x.name)).toEqual(['Alpha']);
    expect(queryVehicles(all, { sort: 'name', standout: '__any' }).map((x) => x.name)).toEqual(['Charlie']);
    expect(queryVehicles(all, { sort: 'name', standout: 'Stock Car' }).map((x) => x.name)).toEqual(['Charlie']);
    expect(queryVehicles(all, { sort: 'name', text: 'delta' }).map((x) => x.name)).toEqual(['Délta']);
    expect(counts(all).makers).toEqual([['Annis', 2], ['Grotti', 2]]);
  });
});

describe('vehicles on the map', () => {
  const vs = [
    v({ name: 'Hellion', manufacturer: 'Annis' }),
    v({ name: 'Coquette', manufacturer: 'Invetero' }),
    v({ name: 'Coquette D10', manufacturer: 'Invetero' }),
    v({ name: "Martha's Vamos", manufacturer: 'Declasse' }),
  ];
  const ms = [
    { id: 'a', name: "Annis '95 Hellion (Moses' request)", category: 'vehicle-request' },
    { id: 'b', name: 'Invetero Coquette D10 (Graffiti)', category: 'standout-vehicle' },
    { id: 'c', name: "Invetero '64 Coquette", category: 'standout-vehicle' },
    { id: 'd', name: "Declasse Martha’s Vamos", category: 'standout-vehicle' },
    { id: 'e', name: 'Fighter Jets', category: 'vehicle-spawn' },
    { id: 'f', name: 'Hellion', category: 'gas-station' },
  ];
  it('matches names with years, notes in brackets and curly apostrophes; longest name wins', () => {
    const r = matchVehicleMarkers(vs, ms);
    expect(r.get('Hellion')).toEqual(['a']);
    expect(r.get('Coquette D10')).toEqual(['b']);
    expect(r.get('Coquette')).toEqual(['c']);
    expect(r.get("Martha's Vamos")).toEqual(['d']);
    expect([...r.values()].flat()).not.toContain('e');
    expect([...r.values()].flat()).not.toContain('f');
  });
  it('filters to vehicles on the map', () => {
    expect(queryVehicles(vs, { sort: 'name', onMapOnly: true, onMap: (x) => x.name === 'Hellion' }).map((x) => x.name)).toEqual(['Hellion']);
  });
});

describe('GTABase-style filters', () => {
  const vs = [
    v({ name: 'Reg', canRegister: 'Yes', security: 'Not Mentioned', access: 'Key', tracker: 'Standard', storage: 4, costToRegister: 6000, costBand: '$5,000 - $10,000' }),
    v({ name: 'Cheap', canRegister: 'Yes', security: 'Advanced (Key Cloner)', access: 'Keyless (Key Cloner)', tracker: 'None', storage: 0, costBand: 'Under $5,000' }),
    v({ name: 'Mystery', security: 'Not Mentioned' }),
  ];
  it('filters by registration, security, access, tracker, storage and cost band; Unknown = not known yet', () => {
    const names = (q: object) => queryVehicles(vs, { sort: 'name', ...q }).map((x) => x.name);
    expect(names({ canRegister: 'Yes' })).toEqual(['Cheap', 'Reg']);
    expect(names({ canRegister: UNKNOWN })).toEqual(['Mystery']);
    expect(names({ access: 'Keyless (Key Cloner)' })).toEqual(['Cheap']);
    expect(names({ tracker: 'Standard', security: 'Not Mentioned' })).toEqual(['Reg']);
    expect(names({ storage: '0' })).toEqual(['Cheap']);
    expect(names({ costBand: 'Under $5,000' })).toEqual(['Cheap']);
  });
  it('lists dropdown options with counts, money bands in price order, Unknown last', () => {
    expect(facetOptions(vs, 'costBand')).toEqual([['Under $5,000', 1], ['$5,000 - $10,000', 1], [UNKNOWN, 1]]);
    expect(facetOptions(vs, 'storage')).toEqual([['0', 1], ['4', 1], [UNKNOWN, 1]]);
  });
  it('uses the list price when the detail page has none', () => {
    expect(queryVehicles(vs, { sort: 'price-asc' }).map((x) => x.name)[0]).toBe('Reg');
  });
});
