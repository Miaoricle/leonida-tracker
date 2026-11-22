import type { Dataset, Group, Category, Marker, Label, Meta } from './types';
import { readCache } from './store';

/**
 * Map data, in order of preference:
 *  1. the IndexedDB cache (filled from the private GitHub repo with your token, or from an imported file)
 *  2. in `vite dev` only: the git-ignored ./dev-data copy
 * Returns null when there's no data yet (first run → onboarding).
 */
export async function loadDataset(): Promise<Dataset | null> {
  const cached = await readCache();
  if (cached) return cached;
  if (!import.meta.env.DEV) return null;
  const base = `${import.meta.env.BASE_URL}dev-data/`;
  const get = async <T>(f: string): Promise<T | null> => {
    const r = await fetch(base + f);
    return r.ok ? ((await r.json()) as T) : null;
  };
  const [markers, cats, labels, meta] = await Promise.all([
    get<Marker[]>('markers.json'),
    get<{ groups: Group[]; categories: Category[] }>('categories.json'),
    get<Label[]>('labels.json'),
    get<Meta>('meta.json'),
  ]);
  if (!markers || !cats) return null;
  return { markers, groups: cats.groups, categories: cats.categories, labels: labels ?? [], meta };
}
