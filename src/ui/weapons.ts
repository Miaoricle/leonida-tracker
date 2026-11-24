// Weapons tab: every GTA 6 weapon (GTABase data) with stats, price, how to get it and where it is on the map.
// Same look and behaviour as the Vehicles tab (reuses its styles).
import { glyphSvg, hitIco } from '../icons/pin';
import { shotUrl } from '../data/images';
import {
  type Weapon, type WeaponSortKey, type WeaponQuery, WEAPON_SORTS, WEAPON_STATS, queryWeapons, weaponCounts, weaponSortValue, wfield, isUnique,
} from '../data/weapons';
import type { VehicleLocation } from './vehicles';
import { getSetting, setSetting } from '../db';
import { trapFocus } from './focus';
import { syncUrl } from '../deeplink';
import { ViewMemory } from './viewmemory';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmtMoney = (n?: number) => (n ? `$${n.toLocaleString('en-US')}` : undefined);
const NOT_LISTED = '<span class="unk">Not listed yet</span>';
// fields shown in their own sections (not repeated in "Info")
const SHOWN = /^(acquisition method|how to unlock|modifications|manufacturer|weapon class|price)$/i;

export interface WeaponsDeps {
  weapons: () => Promise<Weapon[]>;
  /** map markers for this weapon */
  locations?: (w: Weapon) => VehicleLocation[];
  onOpenMarker?: (id: string) => boolean;
  /** switch to the Vehicles tab */
  onVehicles?: () => void;
}

export class WeaponsView {
  readonly el: HTMLElement;
  private list: Weapon[] = [];
  private q: WeaponQuery = { sort: 'damage', type: 'all' };
  private release: (() => void) | null = null;
  private returnFocus: HTMLElement | null = null;
  private io: IntersectionObserver;
  private current: Weapon | null = null;
  private timer = 0;
  private mem: ViewMemory;

  constructor(private d: WeaponsDeps) {
    this.el = document.createElement('div');
    this.el.className = 'vehicles weapons';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Weapons');
    document.body.appendChild(this.el);
    this.mem = new ViewMemory(this.el, () => this.current === null);
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const img = e.target as HTMLImageElement;
        this.io.unobserve(img);
        void shotUrl(img.dataset.src).then((u) => { if (u) { img.src = u; img.parentElement?.classList.remove('loading'); } else img.parentElement?.classList.add('noimg'); });
      }
    }, { rootMargin: '400px 0px' });
    this.el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (this.current) this.showList(); else this.close();
    });
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.classList.contains('v-search')) { clearTimeout(this.timer); this.timer = window.setTimeout(() => { this.q.text = t.value; this.renderGrid(); }, 120); }
    });
    this.el.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.classList.contains('v-sort')) this.q.sort = t.value as WeaponSortKey;
      else if (t.classList.contains('v-class')) this.q.cls = t.value || undefined;
      else if (t.classList.contains('v-maker')) this.q.maker = t.value || undefined;
      else return;
      this.saveQuery();
      this.renderGrid();
    });
  }

  private saveQuery() { void setSetting('weapons.query', { sort: this.q.sort, cls: this.q.cls, maker: this.q.maker, type: this.q.type }); }
  private locs(w: Weapon): VehicleLocation[] { return this.d.locations?.(w) ?? []; }

  async open(slug?: string) {
    this.returnFocus = document.activeElement as HTMLElement | null;
    if (!this.list.length) {
      this.list = await this.d.weapons();
      this.q = { ...this.q, ...(await getSetting<Partial<WeaponQuery>>('weapons.query', {})) };
    }
    this.el.hidden = false;
    this.release = trapFocus(this.el);
    // a plain open (tab bar) resumes where you left the tab: the same detail page, or the list at the same spot
    const resume = !slug && this.mem.resume ? this.list.find((x) => x.slug === this.mem.resume) : undefined;
    const w = slug ? this.list.find((x) => x.slug === slug) : resume;
    if (w) this.showDetail(w, !!resume); else this.showList();
  }

  close() {
    this.mem.resume = this.current?.slug ?? null;
    this.el.hidden = true;
    this.current = null;
    this.release?.();
    syncUrl({ w: null });
    this.returnFocus?.focus?.({ preventScroll: true });
  }

  // ---------- list ----------
  private showList() {
    this.current = null;
    syncUrl({ w: null });
    if (!this.list.length) {
      this.el.innerHTML = `${this.header('Weapons')}<div class="v-empty"><p>No weapon data yet.</p><p class="muted">Run <b>Sync GTABase</b> in your leonida-data repo, then <b>Menu → Settings → Check for updates</b>.</p></div>`;
      return;
    }
    const { classes, makers } = weaponCounts(this.list);
    const unique = this.list.filter(isUnique).length;
    const onMap = this.list.filter((w) => this.locs(w).length).length;
    this.el.innerHTML = `
      ${this.header(`Weapons <small>${this.list.length}</small>`)}
      <div class="v-tools">
        <label class="v-searchbox">${glyphSvg('search', 20)}<input class="v-search" type="search" placeholder="Search weapons, makers, real guns" aria-label="Search weapons" value="${esc(this.q.text ?? '')}" autocomplete="off" spellcheck="false"></label>
        <div class="v-row">
          <select class="v-sort" aria-label="Sort">${WEAPON_SORTS.map(([k, l]) => `<option value="${k}" ${k === this.q.sort ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <select class="v-class" aria-label="Class"><option value="">All classes</option>${classes.map(([c, n]) => `<option value="${esc(c)}" ${c === this.q.cls ? 'selected' : ''}>${esc(c)} (${n})</option>`).join('')}</select>
          <select class="v-maker" aria-label="Manufacturer"><option value="">All makers</option>${makers.map(([c, n]) => `<option value="${esc(c)}" ${c === this.q.maker ? 'selected' : ''}>${esc(c)} (${n})</option>`).join('')}</select>
        </div>
        <div class="seg v-type" role="radiogroup">${([['all', 'All'], ['base', 'Base'], ['unique', `Unique (${unique})`], ['onmap', `On map (${onMap})`]] as const).map(([v, l]) => `<button role="radio" data-type="${v}" aria-checked="${(this.q.type ?? 'all') === v}">${l}</button>`).join('')}</div>
      </div>
      <div class="v-count muted small" aria-live="polite"></div>
      <ul class="v-grid"></ul>`;
    this.renderGrid();
    this.mem.restoreList('data-w');
  }

  private header(title: string, back = false) {
    return `<header class="v-head">
      ${back ? `<button class="icon-btn v-back" aria-label="Back to list">${glyphSvg('chevron_left', 26)}</button>` : ''}
      <h2>${title}</h2>
      ${!back && this.d.onVehicles ? `<button class="icon-btn v-switch" aria-label="Vehicles" title="Vehicles">${glyphSvg('directions_car', 24)}</button>` : ''}
      <button class="icon-btn v-close" aria-label="Close weapons">${glyphSvg('close', 24)}</button>
    </header>`;
  }

  private renderGrid() {
    const grid = this.el.querySelector('.v-grid');
    if (!grid) return;
    const rows = queryWeapons(this.list, { ...this.q, onMap: (w) => this.locs(w).length > 0 });
    const statName = WEAPON_SORTS.find(([k]) => k === this.q.sort)?.[1] ?? '';
    const isMoney = this.q.sort.startsWith('price');
    this.el.querySelector('.v-count')!.textContent = `${rows.length} weapon${rows.length === 1 ? '' : 's'}`;
    grid.innerHTML = rows.length ? rows.map((w) => {
      const val = weaponSortValue(w, this.q.sort);
      const metric = this.q.sort === 'name' ? '' : val === undefined ? `<span class="v-metric unk">${isMoney ? 'No price' : '–'}</span>`
        : isMoney ? `<span class="v-metric">${fmtMoney(val)}</span>`
          : `<span class="v-metric"><span class="bar"><i style="width:${Math.min(100, val * 10)}%"></i></span><b>${val.toFixed(1)}</b></span>`;
      const n = this.locs(w).length;
      return `<li><button class="v-card" data-w="${esc(w.slug)}" aria-label="${esc(w.name)}${val !== undefined && this.q.sort !== 'name' ? `, ${statName} ${isMoney ? fmtMoney(val) : val}` : ''}">
        <span class="v-thumb loading"><img alt="" data-src="${esc(w.thumbnail ?? w.image ?? '')}"></span>
        <span class="v-name">${esc(w.name)}</span>
        <span class="v-sub">${esc([w.manufacturer, w.class].filter(Boolean).join(' · '))}${isUnique(w) ? ' · <em>Unique</em>' : ''}${n ? ` · <span class="v-pin">${glyphSvg('location_on', 13)}${n}</span>` : ''}</span>
        ${metric}
      </button></li>`;
    }).join('') : '<li class="v-none muted">No weapon matches these filters.</li>';
    grid.querySelectorAll<HTMLImageElement>('img[data-src]').forEach((img) => this.io.observe(img));
  }

  // ---------- detail ----------
  private showDetail(w: Weapon, resuming = false) {
    const y = this.mem.enterDetail(w.slug, resuming);
    this.current = w;
    syncUrl({ w: w.slug });
    const locs = this.locs(w);
    const acq = wfield(w, /^acquisition method$/i), unlock = wfield(w, /^how to unlock$/i), mods = wfield(w, /^modifications$/i);
    const info = (w.fields ?? []).filter((f) => !SHOWN.test(f.label));
    const linkItems = (items: { name: string; url: string }[]) => items.map((i) => {
      const t = this.list.find((x) => x.url === i.url);
      return t ? `<button class="chip-btn" data-w="${esc(t.slug)}">${esc(i.name)}</button>` : `<span class="chip-btn static">${esc(i.name)}</span>`;
    }).join('');
    const variants = this.list.filter((x) => x.id !== w.id && x.fields?.some((f) => /base model/i.test(f.label) && f.items?.some((i) => i.url === w.url)));
    this.el.innerHTML = `
      ${this.header(esc(w.name), true)}
      <div class="v-detail">
        <div class="v-hero loading"><img alt="${esc(w.name)}"></div>
        <div class="v-tags">
          ${w.manufacturer ? `<span class="chip">${esc(w.manufacturer)}</span>` : ''}
          ${w.class ? `<span class="chip">${esc(w.class)}</span>` : ''}
          ${isUnique(w) ? '<span class="chip mine">Unique variant</span>' : ''}
        </div>
        <h3 class="sec-h">Where to find it${locs.length ? ` <small>(${locs.length} on the map)</small>` : ''}</h3>
        ${w.location ? `<p class="v-desc">${esc(w.location)}</p>` : ''}
        ${locs.length ? `<ul class="v-locs">${locs.map((l) => `<li><button class="hit v-loc" data-m="${esc(l.id)}">${hitIco(l.category, l.color)}<span class="hit-text"><b>${esc(l.name)}</b><small>${esc(l.catName)}${l.found ? ' · Found ✓' : ''}</small></span>${glyphSvg('chevron_right', 20)}</button></li>`).join('')}</ul>`
          : w.location ? '' : '<p class="muted small v-noloc">Not on the map yet.</p>'}
        <h3 class="sec-h">How to get</h3>
        <dl class="v-kv">
          <dt>Price</dt><dd>${fmtMoney(w.price) ?? NOT_LISTED}</dd>
          <dt>Where to buy / get</dt><dd>${acq ? esc(acq) : NOT_LISTED}</dd>
          <dt>How to unlock</dt><dd>${unlock ? esc(unlock) : NOT_LISTED}</dd>
          <dt>Modifications</dt><dd>${mods ? esc(mods) : NOT_LISTED}</dd>
        </dl>
        <h3 class="sec-h">Stats</h3>
        <ul class="v-stats">${WEAPON_STATS.map((n) => { const s = w.stats?.[n]; return `<li><span>${n}</span><span class="bar"><i style="width:${s === undefined ? 0 : Math.min(100, s * 10)}%"></i></span><b>${s === undefined ? '–' : s.toFixed(1)}</b></li>`; }).join('')}</ul>
        ${w.description ? `<h3 class="sec-h">Description</h3><p class="v-desc">${esc(w.description)}</p>` : ''}
        ${info.length || w.realLife ? `<h3 class="sec-h">Info</h3><dl class="v-kv">${info.map((f) => `<dt>${esc(f.label)}</dt><dd>${f.items ? linkItems(f.items) : esc(f.value ?? '')}</dd>`).join('')}${w.realLife ? `<dt>Real-life weapon</dt><dd>${esc(w.realLife)}</dd>` : ''}</dl>` : ''}
        ${variants.length ? `<h3 class="sec-h">Unique variants</h3><div class="chips">${variants.map((x) => `<button class="chip-btn" data-w="${esc(x.slug)}">${esc(x.name)}</button>`).join('')}</div>` : ''}
        <p class="card-credit"><a href="${esc(w.url)}" target="_blank" rel="noopener">More on GTABase</a> · Weapon data: GTABase.com</p>
      </div>`;
    const hero = this.el.querySelector<HTMLImageElement>('.v-hero img')!;
    void shotUrl(w.image ?? w.thumbnail).then((u) => {
      if (this.current?.id !== w.id) return;
      if (u) { hero.src = u; hero.parentElement!.classList.remove('loading'); } else hero.parentElement!.classList.add('noimg');
    });
    this.el.scrollTop = y;
    this.el.querySelector<HTMLElement>('.v-back')?.focus({ preventScroll: true });
  }

  private onClick(e: Event) {
    const t = e.target as HTMLElement;
    if (t.closest('.v-close')) return this.close();
    if (t.closest('.v-back')) return this.showList();
    if (t.closest('.v-switch')) { this.close(); this.d.onVehicles?.(); return; }
    const type = t.closest<HTMLElement>('[data-type]')?.dataset.type as WeaponQuery['type'];
    if (type) {
      this.q.type = type;
      t.closest('.v-type')!.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-checked', String((b as HTMLElement).dataset.type === type)));
      this.saveQuery();
      this.renderGrid();
      return;
    }
    const mid = t.closest<HTMLElement>('.v-loc')?.dataset.m;
    if (mid) { if (this.d.onOpenMarker?.(mid)) this.close(); return; }
    const slug = t.closest<HTMLElement>('[data-w]')?.dataset.w;
    const w = slug ? this.list.find((x) => x.slug === slug) : undefined;
    if (w) this.showDetail(w);
  }
}
