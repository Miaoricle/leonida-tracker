export interface Group { id: string; name: string; color: string; order: number }

export interface Category {
  id: string;
  name: string;
  group: string;
  icon: string; // GTABase icon key (unused for drawing; see src/icons/mapping.ts)
  color: string;
  trackable: boolean;
  order: number;
  count: number;
  slug?: string; // GTABase sidebar / ?feature= id when it differs from id
  target?: number;
  hidden_default?: boolean;
  closed?: boolean;
}

export interface Marker {
  id: string; // GTABase id, stable across syncs
  category: string;
  x: number;
  y: number;
  name: string;
  description?: string;
  image?: string;
  imageSmall?: string;
  number?: number;
  url?: string;
  approved_at?: string;
  source?: 'gtabase' | 'user' | 'import';
  addedAt?: string;
  [extra: string]: unknown;
}

export interface Label {
  name: string;
  type: 'county' | 'region' | 'city' | 'town' | 'district';
  x: number;
  y: number;
  id?: string;
  polygon?: number[][][];
}

export interface Meta { syncedAt: string; sourceUpdatedAt?: string; markerCount: number; categoryCount: number; source: string }

export interface Dataset { markers: Marker[]; groups: Group[]; categories: Category[]; labels: Label[]; meta: Meta | null }
