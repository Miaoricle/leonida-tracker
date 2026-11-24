import Dexie, { type Table } from 'dexie';
import type { Marker } from './data/types';

export interface Profile { id: string; name: string; createdAt: string }
export interface Progress { profileId: string; markerId: string; found: boolean; foundAt: string }
export interface Note { profileId: string; markerId: string; text: string; updatedAt: string }
export interface Favourite { profileId: string; markerId: string; addedAt: string }
export interface PersonalMarker extends Marker { source: 'user'; profileId: string; customCategory?: string; note?: string; photo?: Blob }
export interface DataCache { key: 'markers' | 'categories' | 'labels' | 'meta' | 'images' | 'vehicles' | 'icons' | 'weapons' | 'missions'; json: unknown; etag?: string; fetchedAt: string }
export interface Setting { key: string; value: unknown }

class LeonidaDB extends Dexie {
  profiles!: Table<Profile, string>;
  progress!: Table<Progress, [string, string]>;
  notes!: Table<Note, [string, string]>;
  favourites!: Table<Favourite, [string, string]>;
  personal!: Table<PersonalMarker, string>;
  dataCache!: Table<DataCache, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super('leonida');
    this.version(1).stores({
      profiles: 'id',
      progress: '[profileId+markerId], profileId, foundAt',
      notes: '[profileId+markerId], profileId',
      favourites: '[profileId+markerId], profileId',
      personal: 'id, profileId, category',
      dataCache: 'key',
      settings: 'key',
    });
  }
}

export const db = new LeonidaDB();

/** Ask the browser not to evict our data (best effort; iOS home-screen apps are usually granted). */
export function requestPersistence(): void {
  navigator.storage?.persist?.().catch(() => {});
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await db.settings.get(key);
    return row === undefined ? fallback : (row.value as T);
  } catch { return fallback; }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  try { await db.settings.put({ key, value }); } catch (e) { console.warn('setting not saved', key, e); }
}
