// GTA 6 story missions (from the private repo's data/missions.json, synced from GTABase's mission guide).
import { db } from '../db';

export interface Mission {
  id: string;
  slug: string;
  name: string;
  url: string;
  chapter: string;
  order: number;
  number?: number;
  optional?: boolean;
  missable?: boolean;
  pointOfNoReturn?: boolean;
  protagonists?: string[];
  summary?: string;
  fields?: { label: string; value: string }[];
  rewards?: string[];
  steps?: { title: string; text?: string; images?: { url: string; alt?: string }[] }[];
  image?: string;
  thumbnail?: string;
}

export async function loadMissions(): Promise<Mission[]> {
  const cached = (await db.dataCache.get('missions'))?.json as { missions?: Mission[] } | undefined;
  if (cached?.missions?.length) return cached.missions;
  if (import.meta.env.DEV) {
    const r = await fetch(`${import.meta.env.BASE_URL}dev-data/missions.json`).catch(() => null);
    if (r?.ok) return ((await r.json()) as { missions: Mission[] }).missions ?? [];
  }
  return [];
}

/** Progress key for a mission (stored with found map markers, so it's per profile and in backups). */
export const missionKey = (m: Mission) => `mission-${m.slug}`;

export interface MissionQuery { text?: string; kind?: 'all' | 'main' | 'optional' | 'missable'; hideDone?: boolean }

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Pure: filter, keeping story order. */
export function queryMissions(all: Mission[], q: MissionQuery, isDone: (m: Mission) => boolean): Mission[] {
  const t = q.text ? norm(q.text.trim()) : '';
  return all.filter((m) =>
    (q.kind !== 'main' || !m.optional) &&
    (q.kind !== 'optional' || !!m.optional) &&
    (q.kind !== 'missable' || !!m.missable) &&
    (!q.hideDone || !isDone(m)) &&
    (!t || norm(`${m.name} ${m.summary ?? ''} ${(m.protagonists ?? []).join(' ')} ${m.fields?.find((f) => /giver/i.test(f.label))?.value ?? ''}`).includes(t)))
    .sort((a, b) => a.order - b.order);
}

/** Pure: done / total per chapter (in story order) and overall. */
export function missionProgress(all: Mission[], isDone: (m: Mission) => boolean) {
  const chapters = new Map<string, { done: number; total: number }>();
  let done = 0;
  for (const m of [...all].sort((a, b) => a.order - b.order)) {
    const c = chapters.get(m.chapter) ?? { done: 0, total: 0 };
    c.total++;
    if (isDone(m)) { c.done++; done++; }
    chapters.set(m.chapter, c);
  }
  return { done, total: all.length, chapters };
}

/** Missable missions in a chapter that aren't done yet, before its point of no return. */
export function missableBefore(all: Mission[], ponr: Mission, isDone: (m: Mission) => boolean): Mission[] {
  return all.filter((m) => m.chapter === ponr.chapter && m.missable && m.order < ponr.order && !isDone(m));
}
