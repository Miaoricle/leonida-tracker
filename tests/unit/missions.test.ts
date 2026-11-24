import { describe, it, expect } from 'vitest';
import { queryMissions, missionProgress, missableBefore, missionKey, type Mission } from '../../src/data/missions';

// synthetic test missions (not GTABase data)
let n = 0;
const m = (o: Partial<Mission> & { name: string; chapter: string }): Mission => ({ id: o.name, slug: o.name.toLowerCase().replace(/ /g, '-'), url: '', order: ++n, ...o });
const all = [
  m({ name: 'Intro', chapter: 'Prologue', number: 1, protagonists: ['Jason Duval'] }),
  m({ name: 'Side Job', chapter: 'Chapter 1', optional: true, missable: true }),
  m({ name: 'Big One', chapter: 'Chapter 1', number: 2, pointOfNoReturn: true, protagonists: ['Lucia Caminos'] }),
  m({ name: 'Later', chapter: 'Chapter 2', number: 3 }),
];
const done = new Set(['mission-intro']);
const isDone = (x: Mission) => done.has(missionKey(x));

describe('missions', () => {
  it('filters story/optional/missable, hides completed, searches characters', () => {
    expect(queryMissions(all, { kind: 'main' }, isDone).map((x) => x.name)).toEqual(['Intro', 'Big One', 'Later']);
    expect(queryMissions(all, { kind: 'optional' }, isDone).map((x) => x.name)).toEqual(['Side Job']);
    expect(queryMissions(all, { kind: 'missable' }, isDone).length).toBe(1);
    expect(queryMissions(all, { hideDone: true }, isDone).map((x) => x.name)).not.toContain('Intro');
    expect(queryMissions(all, { text: 'lucia' }, isDone).map((x) => x.name)).toEqual(['Big One']);
  });
  it('no-spoilers search ignores hidden details of missions not done yet', () => {
    const withGiver = [...all, m({ name: 'Secret Meet', chapter: 'Chapter 2', fields: [{ label: 'Mission Giver', value: 'Mystery Boss' }] })];
    expect(queryMissions(withGiver, { text: 'mystery' }, isDone).map((x) => x.name)).toEqual(['Secret Meet']);
    expect(queryMissions(withGiver, { text: 'mystery', noSpoilers: true }, isDone)).toEqual([]);
  });
  it('counts progress per chapter in story order', () => {
    const p = missionProgress(all, isDone);
    expect(p.done).toBe(1);
    expect([...p.chapters.keys()]).toEqual(['Prologue', 'Chapter 1', 'Chapter 2']);
    expect(p.chapters.get('Chapter 1')).toEqual({ done: 0, total: 2 });
  });
  it('warns about missable missions before a point of no return', () => {
    expect(missableBefore(all, all[2], isDone).map((x) => x.name)).toEqual(['Side Job']);
    done.add('mission-side-job');
    expect(missableBefore(all, all[2], isDone)).toEqual([]);
  });
});
