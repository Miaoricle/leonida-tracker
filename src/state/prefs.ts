import { getSetting, setSetting } from '../db';

export interface Prefs {
  markerSize: 'small' | 'medium' | 'large';
  theme: 'dark' | 'light' | 'system';
  keepAwake: boolean;
}
export const DEFAULT_PREFS: Prefs = { markerSize: 'medium', theme: 'dark', keepAwake: false };
export const PIN_PX: Record<Prefs['markerSize'], number> = { small: 24, medium: 30, large: 38 };

type Listener = (p: Prefs, changed: keyof Prefs) => void;

export class PrefStore {
  private listeners = new Set<Listener>();
  constructor(public value: Prefs) {}

  static async load(): Promise<PrefStore> {
    const raw = await getSetting<Partial<Prefs>>('prefs', {});
    return new PrefStore({ ...DEFAULT_PREFS, ...raw });
  }

  set<K extends keyof Prefs>(k: K, v: Prefs[K]) {
    this.value = { ...this.value, [k]: v };
    void setSetting('prefs', this.value);
    for (const l of this.listeners) l(this.value, k);
  }

  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

/** Apply the theme to <html data-theme> (dark is the default; "system" follows the OS). */
export function applyTheme(theme: Prefs['theme']) {
  const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', resolved === 'light' ? '#f3f6f9' : '#0b1620');
}
