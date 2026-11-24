import { search, type SearchIndex, type Hit } from '../search/search';
import { glyphSvg, hitIco } from '../icons/pin';
import type { Category, Label, Marker } from '../data/types';
import { trapFocus } from './focus';

export interface SearchDeps {
  index: () => SearchIndex;
  onMarker: (m: Marker) => void;
  onCategory: (c: Category) => void;
  onPlace: (l: Label) => void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const PLACE_TYPE: Record<string, string> = { county: 'County', region: 'Region', city: 'City', town: 'Place', district: 'Vice City district' };

export class SearchView {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private list: HTMLElement;
  private hits: Hit[] = [];
  private release: (() => void) | null = null;
  private returnFocus: HTMLElement | null = null;
  private timer = 0;

  constructor(private d: SearchDeps) {
    this.el = document.createElement('div');
    this.el.className = 'search';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Search');
    this.el.innerHTML = `
      <div class="search-bar">
        <span class="search-ico" aria-hidden="true">${glyphSvg('search', 22)}</span>
        <input type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false"
               placeholder="Search markers, categories, places" aria-label="Search markers, categories and places">
        <button class="icon-btn search-close" aria-label="Close search">${glyphSvg('close', 22)}</button>
      </div>
      <div class="search-results" role="listbox" aria-label="Results"></div>`;
    document.body.appendChild(this.el);
    this.input = this.el.querySelector('input')!;
    this.list = this.el.querySelector('.search-results')!;
    this.input.addEventListener('input', () => { clearTimeout(this.timer); this.timer = window.setTimeout(() => this.run(), 80); });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.hits[0]) this.pick(0);
      if (e.key === 'ArrowDown') { e.preventDefault(); this.list.querySelector<HTMLElement>('[data-i]')?.focus(); }
    });
    this.el.querySelector('.search-close')!.addEventListener('click', () => this.close());
    this.el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.close(); } });
    this.list.addEventListener('click', (e) => {
      const i = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')?.dataset.i;
      if (i !== undefined) this.pick(+i);
    });
  }

  open() {
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.el.hidden = false;
    this.input.focus();
    this.input.select();
    this.run();
    this.release = trapFocus(this.el);
  }

  close() {
    this.el.hidden = true;
    this.release?.();
    this.returnFocus?.focus?.({ preventScroll: true });
  }

  private run() {
    const q = this.input.value;
    const r = search(this.d.index(), q);
    this.hits = [...r.places, ...r.categories, ...r.markers];
    if (!q.trim()) { this.list.innerHTML = '<p class="search-hint">Try "hidden package", "fútbol" or "Little Cuba".</p>'; return; }
    if (!this.hits.length) { this.list.innerHTML = `<p class="search-empty">No marker matches "${esc(q.trim())}"</p>`; return; }
    let i = 0;
    const section = (title: string, hits: Hit[]) => hits.length ? `<h3 class="search-h">${title}</h3><ul>${hits.map((h) => this.item(h, i++)).join('')}</ul>` : '';
    this.list.innerHTML = section('Places', r.places) + section('Categories', r.categories) + section('Markers', r.markers);
  }

  private item(h: Hit, i: number) {
    if (h.type === 'place') {
      return `<li><button data-i="${i}" role="option" class="hit"><span class="hit-ico place">${glyphSvg('map', 18)}</span>
        <span class="hit-text"><b>${esc(h.label.name)}</b><small>${PLACE_TYPE[h.label.type] ?? 'Place'}</small></span></button></li>`;
    }
    if (h.type === 'category') {
      return `<li><button data-i="${i}" role="option" class="hit">${hitIco(h.category.id, h.category.color)}
        <span class="hit-text"><b>${esc(h.category.name)}</b><small>Show only · ${h.category.count}</small></span></button></li>`;
    }
    const c = h.category;
    return `<li><button data-i="${i}" role="option" class="hit">${hitIco(h.marker.category, c?.color ?? '#888')}
      <span class="hit-text"><b>${esc(h.marker.name)}</b><small>${esc(c?.name ?? h.marker.category)}</small></span></button></li>`;
  }

  private pick(i: number) {
    const h = this.hits[i];
    if (!h) return;
    this.close();
    if (h.type === 'marker') this.d.onMarker(h.marker);
    else if (h.type === 'category') this.d.onCategory(h.category);
    else this.d.onPlace(h.label);
  }
}
