import { glyphSvg, hitIco } from '../icons/pin';
import { shotUrl } from '../data/images';
import {
  type Vehicle, type SortKey, type VehicleQuery, SORTS, STAT_NAMES, queryVehicles, counts, sortValue, stat, price, sellValue, tracker, field,
} from '../data/vehicles';
import { getSetting, setSetting } from '../db';
import { trapFocus } from './focus';
import { syncUrl } from '../deeplink';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmtMoney = (n?: number) => (n === undefined ? undefined : `$${n.toLocaleString('en-US')}`);
const NOT_LISTED = '<span class="unk">Not listed yet</span>';
// fields shown in their own sections (not repeated in "Info")
const SHOWN = /^(cost to (register|buy)|price|tracker|sell value.*|variant.*|vehicle class|manufacturer|standout set|rating)$/i;

export interface VehicleLocation { id: string; name: string; category: string; catName: string; color: string; found: boolean }

export interface VehiclesDeps {
  vehicles: () => Promise<Vehicle[]>;
  /** map markers showing this vehicle (standout vehicles, spawns, requests) */
  locations?: (v: Vehicle) => VehicleLocation[];
  /** open a map marker; true when it exists */
  onOpenMarker?: (id: string) => boolean;
}

export class VehiclesView {
  readonly el: HTMLElement;
  private list: Vehicle[] = [];
  private q: VehicleQuery = { sort: 'speed', type: 'all' };
  private release: (() => void) | null = null;
  private returnFocus: HTMLElement | null = null;
  private io: IntersectionObserver;
  private current: Vehicle | null = null;
  private timer = 0;

  constructor(private d: VehiclesDeps) {
    this.el = document.createElement('div');
    this.el.className = 'vehicles';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Vehicles');
    document.body.appendChild(this.el);
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
      if (t.classList.contains('v-sort')) this.q.sort = t.value as SortKey;
      else if (t.classList.contains('v-class')) this.q.cls = t.value || undefined;
      else if (t.classList.contains('v-maker')) this.q.maker = t.value || undefined;
      else return;
      void setSetting('vehicles.query', { sort: this.q.sort, cls: this.q.cls, maker: this.q.maker, type: this.q.type });
      this.renderGrid();
    });
  }

  async open(slug?: string) {
    this.returnFocus = document.activeElement as HTMLElement | null;
    if (!this.list.length) {
      this.list = await this.d.vehicles();
      this.q = { ...this.q, ...(await getSetting<Partial<VehicleQuery>>('vehicles.query', {})) };
    }
    this.el.hidden = false;
    this.release = trapFocus(this.el);
    const v = slug ? this.list.find((x) => x.slug === slug) : undefined;
    if (v) this.showDetail(v); else this.showList();
  }

  close() {
    this.el.hidden = true;
    this.current = null;
    this.release?.();
    syncUrl({ v: null } );
    this.returnFocus?.focus?.({ preventScroll: true });
  }

  // ---------- list ----------
  private showList() {
    this.current = null;
    syncUrl({ v: null } );
    if (!this.list.length) {
      this.el.innerHTML = `${this.header('Vehicles')}<div class="v-empty"><p>No vehicle data yet.</p><p class="muted">Run <b>Sync GTABase</b> in your leonida-data repo, then <b>Menu → Settings → Check for updates</b>.</p></div>`;
      return;
    }
    const { classes, makers } = counts(this.list);
    const standouts = this.list.filter((v) => v.standoutSet).length;
    const onMap = this.list.filter((v) => this.locs(v).length).length;
    this.el.innerHTML = `
      ${this.header(`Vehicles <small>${this.list.length}</small>`)}
      <div class="v-tools">
        <label class="v-searchbox">${glyphSvg('search', 20)}<input class="v-search" type="search" placeholder="Search vehicles, makers, real cars" aria-label="Search vehicles" value="${esc(this.q.text ?? '')}" autocomplete="off" spellcheck="false"></label>
        <div class="v-row">
          <select class="v-sort" aria-label="Sort">${SORTS.map(([k, l]) => `<option value="${k}" ${k === this.q.sort ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <select class="v-class" aria-label="Class"><option value="">All classes</option>${classes.map(([c, n]) => `<option value="${esc(c)}" ${c === this.q.cls ? 'selected' : ''}>${esc(c)} (${n})</option>`).join('')}</select>
          <select class="v-maker" aria-label="Manufacturer"><option value="">All makers</option>${makers.map(([c, n]) => `<option value="${esc(c)}" ${c === this.q.maker ? 'selected' : ''}>${esc(c)} (${n})</option>`).join('')}</select>
        </div>
        <div class="seg v-type" role="radiogroup">${([['all', 'All'], ['regular', 'Regular'], ['standout', `Standouts (${standouts})`], ['onmap', `On map (${onMap})`]] as const).map(([v, l]) => `<button role="radio" data-type="${v}" aria-checked="${(this.q.type ?? 'all') === v}">${l}</button>`).join('')}</div>
      </div>
      <div class="v-count muted small" aria-live="polite"></div>
      <ul class="v-grid"></ul>`;
    this.renderGrid();
  }

  private header(title: string, back = false) {
    return `<header class="v-head">
      ${back ? `<button class="icon-btn v-back" aria-label="Back to list">${glyphSvg('chevron_left', 26)}</button>` : ''}
      <h2>${title}</h2>
      <button class="icon-btn v-close" aria-label="Close vehicles">${glyphSvg('close', 24)}</button>
    </header>`;
  }

  private renderGrid() {
    const grid = this.el.querySelector('.v-grid');
    if (!grid) return;
    const rows = queryVehicles(this.list, { ...this.q, onMap: (v) => this.locs(v).length > 0 });
    const statName = SORTS.find(([k]) => k === this.q.sort)?.[1] ?? '';
    this.el.querySelector('.v-count')!.textContent = `${rows.length} vehicle${rows.length === 1 ? '' : 's'}`;
    grid.innerHTML = rows.length ? rows.map((v) => {
      const val = sortValue(v, this.q.sort);
      const isMoney = this.q.sort.startsWith('price') || this.q.sort === 'sell-desc';
      const metric = this.q.sort === 'name' ? '' : val === undefined ? `<span class="v-metric unk">${isMoney ? 'No price' : '–'}</span>`
        : isMoney ? `<span class="v-metric">${fmtMoney(val)}</span>`
          : `<span class="v-metric"><span class="bar"><i style="width:${Math.min(100, val * 10)}%"></i></span><b>${val.toFixed(1)}</b></span>`;
      return `<li><button class="v-card" data-v="${esc(v.slug)}" aria-label="${esc(v.name)}${val !== undefined && this.q.sort !== 'name' ? `, ${statName} ${isMoney ? fmtMoney(val) : val}` : ''}">
        <span class="v-thumb loading"><img alt="" data-src="${esc(v.thumbnail ?? v.image ?? '')}"></span>
        <span class="v-name">${esc(v.name)}</span>
        <span class="v-sub">${esc([v.manufacturer, v.class[0]].filter(Boolean).join(' · '))}${v.standoutSet ? ' · <em>Standout</em>' : ''}${((n) => (n ? ` · <span class="v-pin">${glyphSvg('location_on', 13)}${n}</span>` : ''))(this.locs(v).length)}</span>
        ${metric}
      </button></li>`;
    }).join('') : '<li class="v-none muted">No vehicle matches these filters.</li>';
    grid.querySelectorAll<HTMLImageElement>('img[data-src]').forEach((img) => this.io.observe(img));
  }

  // ---------- detail ----------
  private showDetail(v: Vehicle) {
    this.current = v;
    syncUrl({ v: v.slug } );
    const p = price(v), sell = sellValue(v), tr = tracker(v);
    const locs = this.locs(v);
    const security = field(v, /security|alarm/i), cloner = field(v, /key ?clon|keyless/i);
    const variants = v.fields?.find((f) => /variant/i.test(f.label))?.items ?? [];
    const info = (v.fields ?? []).filter((f) => !SHOWN.test(f.label));
    const linkItems = (items: { name: string; url: string }[]) => items.map((i) => {
      const t = this.list.find((x) => x.url === i.url);
      return t ? `<button class="chip-btn" data-v="${esc(t.slug)}">${esc(i.name)}</button>` : `<span class="chip-btn static">${esc(i.name)}</span>`;
    }).join('');
    this.el.innerHTML = `
      ${this.header(esc(v.name), true)}
      <div class="v-detail">
        <div class="v-hero loading"><img alt="${esc(v.name)}"></div>
        <div class="v-tags">
          ${v.manufacturer ? `<span class="chip">${esc(v.manufacturer)}</span>` : ''}
          ${v.class.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}
          ${v.standoutSet ? `<span class="chip mine">Standout · ${esc(v.standoutSet)}</span>` : ''}
        </div>
        ${locs.length ? `<h3 class="sec-h">Where to find it <small>(${locs.length} on the map)</small></h3>
        <ul class="v-locs">${locs.map((l) => `<li><button class="hit v-loc" data-m="${esc(l.id)}">${hitIco(l.category, l.color)}<span class="hit-text"><b>${esc(l.name)}</b><small>${esc(l.catName)}${l.found ? ' · Found ✓' : ''}</small></span>${glyphSvg('chevron_right', 20)}</button></li>`).join('')}</ul>` : '<p class="muted small v-noloc">Not on the map yet.</p>'}
        <h3 class="sec-h">How to get</h3>
        <dl class="v-kv">
          <dt>Cost to register</dt><dd>${fmtMoney(p) ?? NOT_LISTED}</dd>
          <dt>Sell value (stolen)</dt><dd>${fmtMoney(sell) ?? NOT_LISTED}</dd>
          <dt>Tracker</dt><dd>${tr ? `<span class="trk trk-${esc(tr.toLowerCase().replace(/\W+/g, '-'))}">${esc(tr)}</span>` : NOT_LISTED}</dd>
          <dt>Security / alarm</dt><dd>${security ? esc(security) : NOT_LISTED}</dd>
          <dt>Key cloner</dt><dd>${cloner ? esc(cloner) : NOT_LISTED}</dd>
        </dl>
        <h3 class="sec-h">Stats</h3>
        <ul class="v-stats">${STAT_NAMES.map((n) => { const s = stat(v, n); return `<li><span>${n}</span><span class="bar"><i style="width:${s === undefined ? 0 : Math.min(100, s * 10)}%"></i></span><b>${s === undefined ? '–' : s.toFixed(1)}</b></li>`; }).join('')}</ul>
        ${v.asphaltOvr || v.offroadOvr ? `<p class="muted small">Overall rating: asphalt ${v.asphaltOvr ?? '–'} · off-road ${v.offroadOvr ?? '–'}</p>` : ''}
        ${v.description ? `<h3 class="sec-h">Description</h3><p class="v-desc">${esc(v.description)}</p>` : ''}
        ${info.length ? `<h3 class="sec-h">Info</h3><dl class="v-kv">${info.map((f) => `<dt>${esc(f.label)}</dt><dd>${f.items ? linkItems(f.items) : esc(f.value ?? '')}</dd>`).join('')}</dl>` : ''}
        ${variants.length ? `<h3 class="sec-h">Variants</h3><div class="chips">${linkItems(variants)}</div>` : ''}
        <p class="card-credit"><a href="${esc(v.url)}" target="_blank" rel="noopener">More on GTABase</a> · Vehicle data: GTABase.com</p>
      </div>`;
    const hero = this.el.querySelector<HTMLImageElement>('.v-hero img')!;
    void shotUrl(v.image ?? v.thumbnail).then((u) => {
      if (this.current?.id !== v.id) return;
      if (u) { hero.src = u; hero.parentElement!.classList.remove('loading'); } else hero.parentElement!.classList.add('noimg');
    });
    this.el.scrollTop = 0;
    this.el.querySelector<HTMLElement>('.v-back')?.focus();
  }

  private locs(v: Vehicle): VehicleLocation[] { return this.d.locations?.(v) ?? []; }

  private onClick(e: Event) {
    const t = e.target as HTMLElement;
    if (t.closest('.v-close')) return this.close();
    if (t.closest('.v-back')) return this.showList();
    const type = t.closest<HTMLElement>('[data-type]')?.dataset.type as VehicleQuery['type'];
    if (type) {
      this.q.type = type;
      t.closest('.v-type')!.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-checked', String((b as HTMLElement).dataset.type === type)));
      void setSetting('vehicles.query', { sort: this.q.sort, cls: this.q.cls, maker: this.q.maker, type: this.q.type });
      this.renderGrid();
      return;
    }
    const mid = t.closest<HTMLElement>('.v-loc')?.dataset.m;
    if (mid) { if (this.d.onOpenMarker?.(mid)) this.close(); return; }
    const slug = t.closest<HTMLElement>('[data-v]')?.dataset.v;
    const v = slug ? this.list.find((x) => x.slug === slug) : undefined;
    if (v) this.showDetail(v);
  }
}
