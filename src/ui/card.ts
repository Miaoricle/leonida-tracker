import type { Category, Marker } from '../data/types';
import type { ProgressStore } from '../state/progress';
import { glyphSvg } from '../icons/pin';
import { iconFor } from '../icons/mapping';
import { Sheet } from './sheet';
import { openViewer } from './viewer';
import { appUrl, shareLink } from './share';

export interface CardDeps {
  progress: ProgressStore;
  category: (id: string) => Category | undefined;
  siblings: (m: Marker) => Marker[]; // markers of the same category, in order
  onNavigate: (m: Marker) => void; // prev / next
  onZoom: (m: Marker) => void;
  onClose: () => void;
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
    const img = m.imageSmall || m.image;
    this.sheet.titleEl.textContent = m.name;
    this.sheet.el.setAttribute('aria-label', m.name);
    this.sheet.body.innerHTML = `
      <div class="card" style="--c:${c?.color ?? '#888'}">
        <div class="card-meta">
          <span class="chip"><span class="chip-ico">${glyphSvg(iconFor(m.category), 14)}</span>${esc(c?.name ?? m.category)}</span>
          ${sibs.length > 1 ? `<span class="card-n">#${n} of ${sibs.length}</span>` : ''}
        </div>
        ${c?.trackable !== false ? `<button class="found-btn" aria-pressed="false"><span class="found-ico">${glyphSvg('check', 24)}</span><span class="found-label">Mark as found</span></button>` : '<p class="countonly">Count-only category (not tracked)</p>'}
        <div class="card-actions">
          <button class="act fav" aria-pressed="false" aria-label="Favourite">${glyphSvg('star', 22)}<span>Favourite</span></button>
          <button class="act share" aria-label="Share link">${glyphSvg('share', 22)}<span>Share</span></button>
          <button class="act zoom" aria-label="Zoom in">${glyphSvg('zoom_in', 22)}<span>Zoom</span></button>
        </div>
        ${img ? `<button class="card-img" aria-label="View image full screen"><img loading="lazy" decoding="async" alt="" src="${esc(img)}"></button>` : ''}
        ${m.description ? `<p class="card-desc">${esc(m.description)}</p>` : ''}
        <label class="field note-field"><span>My note</span><textarea class="note" rows="2" placeholder="Private note (only on this device)"></textarea></label>
        <div class="card-nav">
          <button class="pill nav-prev" ${sibs.length < 2 ? 'disabled' : ''}>${glyphSvg('chevron_left', 20)} Previous</button>
          <button class="pill nav-next" ${sibs.length < 2 ? 'disabled' : ''}>Next ${glyphSvg('chevron_right', 20)}</button>
        </div>
        <p class="card-credit">${[m.shot_by ? `Screenshot: ${esc(String(m.shot_by))}` : '', m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">More on GTABase</a>` : ''].filter(Boolean).join(' · ') || 'Location data: GTABase'}</p>
      </div>`;
    const im = this.sheet.body.querySelector<HTMLImageElement>('.card-img img');
    if (im) im.onerror = () => im.closest('.card-img')?.remove(); // hide quietly if it fails (e.g. offline, not cached)
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
      void shareLink(appUrl({ m: m.id }), m.name);
    } else if (t.closest('.zoom')) {
      this.d.onZoom(m);
    } else if (t.closest('.card-img')) {
      openViewer(m.image || m.imageSmall!, m.name);
    } else if (t.closest('.nav-prev') || t.closest('.nav-next')) {
      const sibs = this.d.siblings(m);
      const i = sibs.findIndex((x) => x.id === m.id);
      const next = sibs[(i + (t.closest('.nav-next') ? 1 : -1) + sibs.length) % sibs.length];
      if (next) this.d.onNavigate(next);
    }
  }
}
