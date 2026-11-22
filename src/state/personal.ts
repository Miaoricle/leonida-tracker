// Personal markers ("My Map"): per profile, optional photo (≤ 5 MB in, downscaled to 1280 px JPEG).
import { db, type PersonalMarker } from '../db';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_MAX_PX = 1280;
export const CUSTOM_COLOR = '#e91e63';

type Listener = () => void;

export class PersonalStore {
  list: PersonalMarker[] = [];
  private urls = new Map<string, string>();
  private listeners = new Set<Listener>();

  async load(profileId: string) {
    this.list = await db.personal.where('profileId').equals(profileId).toArray();
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
    this.emit();
  }

  get(id: string) { return this.list.find((m) => m.id === id); }

  photoUrl(m: PersonalMarker): string | undefined {
    if (!m.photo) return undefined;
    let u = this.urls.get(m.id);
    if (!u) { u = URL.createObjectURL(m.photo); this.urls.set(m.id, u); }
    return u;
  }

  async save(m: PersonalMarker) {
    await db.personal.put(m);
    const i = this.list.findIndex((x) => x.id === m.id);
    if (i >= 0) this.list[i] = m; else this.list.push(m);
    const u = this.urls.get(m.id);
    if (u) { URL.revokeObjectURL(u); this.urls.delete(m.id); }
    this.emit();
  }

  async remove(id: string) {
    await db.personal.delete(id);
    this.list = this.list.filter((m) => m.id !== id);
    this.emit();
  }

  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { for (const l of this.listeners) l(); }
}

export const newPersonalId = () => `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Downscale a photo so its longest side is ≤ 1280 px, re-encoded as JPEG ~0.82. */
export async function preparePhoto(file: File): Promise<Blob> {
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Photo is larger than 5 MB');
  if (!file.type.startsWith('image/')) throw new Error('That file isn\'t an image');
  const bmp = await createImageBitmap(file).catch(() => null);
  const src: CanvasImageSource & { width: number; height: number } = bmp ?? await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Couldn\'t read that image')); i.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, PHOTO_MAX_PX / Math.max(src.width, src.height));
  const w = Math.round(src.width * scale), h = Math.round(src.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(src, 0, 0, w, h);
  bmp?.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Couldn\'t encode photo'))), 'image/jpeg', 0.82));
}
