import type { Dataset, Group, Category, Marker, Label, Meta } from './types';

/**
 * Phase 2: dev-only loader that reads the git-ignored ./dev-data copy served by the Vite dev server.
 * Phase 5 adds the real sources (GitHub API with token + IndexedDB cache, and file import).
 */
export async function loadDataset(): Promise<Dataset | null> {
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
