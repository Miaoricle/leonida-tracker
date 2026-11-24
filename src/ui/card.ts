import type { Category, Marker } from '../data/types';
import type { ProgressStore } from '../state/progress';
import { glyphSvg, catIcon } from '../icons/pin';
import { iconFor } from '../icons/mapping';
import { Sheet } from './sheet';
import { openViewer } from './viewer';
import { appUrl, shareLink } from './share';
import { shotUrl } from '../data/images';

export interface CardDeps {
  progress: ProgressStore;
  category: (id: string) => Category | undefined;
  siblings: (m: Marker) => Marker[]; // markers of the same category, in order
  onNavigate: (m: Marker) => void; // prev / next
  onZoom: (m: Marker) => void;
  onClose: () => void;
  /** personal markers: photo URL, edit and delete */
  photoUrl?: (m: Marker) => string | undefined;
  onEdit?: (m: Marker) => void;
  onDelete?: (m: Marker) => void;
  /** vehicle shown by this marker (standout vehicles etc.): opens its page in the Vehicles tab */
  vehicleFor?: (m: Marker) => string | undefined;
  onVehicle?: (slug: string) => void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class MarkerCard {
  readonly sheet: Sheet;
  marker: Marker | null = null;
  private noteTimer = 0;

  constructor(private d: CardDeps) {
    this.sheet = new Sheet({ id: 'card', title: 'Marker', peekHeight: 196, onSnap: (s) => { if (s === 'closed') { this.flushNote(); this.marker = null; d.onClose(); } } });
    this.sheet.el.classList.add('card-sheet');
    this.sheet.body.addEventListener('click', (e) => this.onClick(e));
    this.sheet.body.addEventListener('input', (e) => {
      if (!(e.target as HTMLElement).classList.contains('note')) return;
      clearTimeout(this.noteTimer);
      this.noteTimer = window.setTimeout(() => this.flushNote(), 400);
    });
    d.progress.on((id) => { if (this.marker && (id === null || id === this.marker.id)) this.syncState(); });
  }

  open(m: Marker) {
    if (this.marker && this.marker.id !== m.id) this.flushNote();
    if (this.marker && this.marker.id !== m.id) this.d.onClose();
    this.marker = m;
    this.render();
    this.sheet.open(this.sheet.snap === 'full' ? 'full' : 'half');
  }

  close() { this.sheet.close(); }

  private flushNote() {
    clearTimeout(this.noteTimer);
    const ta = this.sheet.body.querySelector<HTMLTextAreaElement>('.note');
    if (this.marker && ta && ta.value !== this.d.progress.note(this.marker.id)) void this.d.progress.setNote(this.marker.id, ta.value);
  }

  private render() {
    const m = this.marker!;
    const c = this.d.category(m.category);
    const sibs = this.d.siblings(m);
    const n = sibs.findIndex((x) => x.id === m.id) + 1;
    const user = m.source === 'user';
    const img = user ? this.d.photoUrl?.(m) : undefined;
    const shot = !user && (m.imageSmall || m.image);
    const catName = user ? (String(m.customCategory ?? '') || c?.name || 'My marker') : c?.name ?? m.category;
    this.sheet.titleEl.textContent = m.name;
    this.sheet.el.setAttribute('aria-label', m.name);
    this.sheet.body.innerHTML = `
      <div class="card" style="--c:${c?.color ?? (m.source === 'user' ? '#e91e63' : '#888')}">
        <div class="card-meta">
          <span class="chip">${((ic) => `<span class="chip-ico${ic.blip ? ' has-blip' : ''}">${ic.html}</span>`)(catIcon(user && m.customCategory ? 'custom' : m.category, iconFor(m.category), 14))}${esc(catName)}</span>${user ? '<span class="chip mine">My marker</span>' : ''}
          ${sibs.length > 1 ? `<span class="card-n">#${n} of ${sibs.length}</span>` : ''}
        </div>
        ${user || c?.trackable !== false ? `<button class="found-btn" aria-pressed="false"><span class="found-ico">${glyphSvg('check', 24)}</span><span class="found-label">Mark as found</span></button>` : '<p class="countonly">Count-only category (not tracked)</p>'}
        <div class="card-actions">
          <button class="act fav" aria-pressed="false" aria-label="Favourite">${glyphSvg('star', 22)}<span>Favourite</span></button>
          <button class="act share" aria-label="Share link">${glyphSvg('share', 22)}<span>Share</span></button>
          <button class="act zoom" aria-label="Zoom in">${glyphSvg('zoom_in', 22)}<span>Zoom</span></button>
          ${this.d.vehicleFor?.(m) ? `<button class="act veh" aria-label="Vehicle details">${glyphSvg('directions_car', 22)}<span>Vehicle</span></button>` : ''}
        </div>
        ${img ? `<button class="card-img" aria-label="View image full screen"><img decoding="async" alt="" src="${esc(img)}"></button>` : ''}
        ${shot ? '<button class="card-img loading" aria-label="View screenshot full screen"><img decoding="async" alt=""></button>' : ''}
        ${m.description ? `<p class="card-desc">${esc(m.description)}</p>` : ''}
        <label class="field note-field"><span>My note</span><textarea class="note" rows="2" placeholder="Private note (only on this device)"></textarea></label>
        ${user ? `<div class="card-nav"><button class="pill p-edit">${glyphSvg('edit', 18)} Edit</button><button class="pill p-del">${glyphSvg('delete', 18)} Delete</button></div>
        <p class="muted drag-hint">Drag the pin to move it while this card is open.</p>` : ''}
        <div class="card-nav" ${user ? 'hidden' : ''}>
          <button class="pill nav-prev" ${sibs.length < 2 ? 'disabled' : ''}>${glyphSvg('chevron_left', 20)} Previous</button>
          <button class="pill nav-next" ${sibs.length < 2 ? 'disabled' : ''}>Next ${glyphSvg('chevron_right', 20)}</button>
        </div>
        ${user ? '' : `<p class="card-credit">${[m.shot_by ? `Screenshot: ${esc(String(m.shot_by))}` : '', m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">More on GTABase</a>` : ''].filter(Boolean).join(' · ') || 'Location data: GTABase'}</p>`}
      </div>`;
    const im = this.sheet.body.querySelector<HTMLImageElement>('.card-img img');
    if (im) im.onerror = () => im.closest('.card-img')?.remove(); // hide quietly if it fails (e.g. offline, not cached)
    if (shot && im) {
      const forId = m.id;
      void shotUrl(m.imageSmall || m.image).then((u) => {
        if (this.marker?.id !== forId) return;
        if (u) { im.src = u; im.closest('.card-img')?.classList.remove('loading'); } else im.closest('.card-img')?.remove();
      });
    }
    this.sheet.body.querySelector<HTMLTextAreaElement>('.note')!.value = this.d.progress.note(m.id);
    this.sheet.body.scrollTop = 0;
    this.syncState();
  }

  private syncState() {
    const m = this.marker;
    if (!m) return;
    const found = this.d.progress.isFound(m.id);
    const fb = this.sheet.body.querySelector<HTMLElement>('.found-btn');
    if (fb) {
      fb.setAttribute('aria-pressed', String(found));
      fb.classList.toggle('on', found);
      fb.querySelector('.found-label')!.textContent = found ? 'Found' : 'Mark as found';
    }
    const fav = this.d.progress.isFavourite(m.id);
    const fv = this.sheet.body.querySelector<HTMLElement>('.fav')!;
    fv.setAttribute('aria-pressed', String(fav));
    fv.classList.toggle('on', fav);
  }

  private onClick(e: Event) {
    const t = e.target as HTMLElement;
    const m = this.marker;
    if (!m) return;
    if (t.closest('.found-btn')) {
      navigator.vibrate?.(15);
      void this.d.progress.setFound(m.id, !this.d.progress.isFound(m.id));
    } else if (t.closest('.fav')) {
      void this.d.progress.setFavourite(m.id, !this.d.progress.isFavourite(m.id));
    } else if (t.closest('.share')) {
      // personal markers only exist on this device: share the spot instead
      void shareLink(m.source === 'user' ? appUrl({ at: `${Math.round(m.x)},${Math.round(m.y)},6` }) : appUrl({ m: m.id }), m.name);
    } else if (t.closest('.veh')) {
      const slug = this.d.vehicleFor?.(m);
      if (slug) this.d.onVehicle?.(slug);
    } else if (t.closest('.zoom')) {
      this.d.onZoom(m);
    } else if (t.closest('.card-img')) {
      if (m.source === 'user') openViewer(this.d.photoUrl!(m)!, m.name);
      else void shotUrl(m.image || m.imageSmall).then((u) => u && openViewer(u, m.name));
    } else if (t.closest('.p-edit')) {
      this.d.onEdit?.(m);
    } else if (t.closest('.p-del')) {
      this.d.onDelete?.(m);
    } else if (t.closest('.nav-prev') || t.closest('.nav-next')) {
      const sibs = this.d.siblings(m);
      const i = sibs.findIndex((x) => x.id === m.id);
      const next = sibs[(i + (t.closest('.nav-next') ? 1 : -1) + sibs.length) % sibs.length];
      if (next) this.d.onNavigate(next);
    }
  }
}
