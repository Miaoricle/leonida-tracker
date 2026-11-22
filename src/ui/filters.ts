import type { Category, Group } from '../data/types';
import { glyphSvg } from '../icons/pin';
import { iconFor } from '../icons/mapping';
import { FilterStore, setCategory, setGroup, showAll, hideAll, toggleOnly, toggleCollapsed, isVisible } from '../state/filters';
import type { Counts } from '../state/progress';
import { Sheet } from './sheet';
import { toast } from './toast';
import { getSetting, setSetting } from '../db';

export interface FilterPanelDeps {
  groups: Group[];
  categories: Category[];
  store: FilterStore;
  counts: () => { perCat: Map<string, Counts>; perGroup: Map<string, Counts> };
  onNextUnfound: (categoryId: string) => void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pct = (c?: Counts) => (c && c.total ? Math.round((c.found / c.total) * 100) : 0);
const LONG_PRESS_MS = 500;

export class FilterPanel {
  readonly sheet: Sheet;
  private cats: Category[];

  constructor(private d: FilterPanelDeps) {
    this.sheet = new Sheet({ id: 'filters', title: 'Filters', peekHeight: 132, sidebar: true });
    this.cats = d.categories.filter((c) => c.count > 0).sort((a, b) => a.order - b.order);
    this.render();
    d.store.on(() => this.sync());
  }

  private render() {
    const { groups } = this.d;
    const byGroup = new Map<string, Category[]>();
    for (const c of this.cats) byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), c]);
    const html: string[] = [`
      <div class="flt-pinned">
        <button class="pill" data-act="all"></button>
        <button class="pill" data-act="found"></button>
      </div>`];
    for (const g of [...groups].sort((a, b) => a.order - b.order)) {
      const cats = byGroup.get(g.id);
      if (!cats?.length) continue;
      html.push(`
      <section class="grp" data-g="${g.id}" style="--c:${g.color}">
        <div class="grp-head">
          <input type="checkbox" class="cb grp-cb" aria-label="Show all ${esc(g.name)}">
          <button class="grp-toggle" aria-expanded="true">
            <span class="grp-name">${esc(g.name)}</span>
            <span class="grp-count"></span>
            <span class="chev" aria-hidden="true">${glyphSvg('chevron_right', 20)}</span>
          </button>
        </div>
        <div class="bar grp-bar"><i></i></div>
        <ul class="cats">${cats.map((c) => this.row(c, g)).join('')}</ul>
      </section>`);
    }
    this.sheet.body.innerHTML = `<div class="flt">${html.join('')}</div>`;
    this.bind();
    this.sync();
  }

  private row(c: Category, g: Group) {
    return `
      <li class="cat" data-c="${c.id}" style="--c:${c.color || g.color}">
        <label class="cat-main">
          <input type="checkbox" class="cb cat-cb">
          <span class="mini-pin" aria-hidden="true">${glyphSvg(iconFor(c.id), 16)}</span>
          <span class="cat-text">
            <span class="cat-name">${esc(c.name)}</span>
            <span class="cat-count"></span>
            ${c.trackable ? '<span class="bar"><i></i></span>' : ''}
          </span>
        </label>
        <button class="only" aria-pressed="false">Only</button>
        ${c.trackable ? `<button class="next icon-btn" aria-label="Next unfound ${esc(c.name)}">${glyphSvg('chevron_right', 22)}</button>` : '<span class="next-ph"></span>'}
      </li>`;
  }

  private bind() {
    const { store } = this.d;
    const body = this.sheet.body;
    const all = store.allIds;
    body.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'all') return store.update((s) => (s.hidden.length >= all.length ? showAll(s) : hideAll(s, all)));
      if (act === 'found') return store.update((s) => ({ ...s, hideFound: !s.hideFound }));
      const g = t.closest<HTMLElement>('.grp')?.dataset.g;
      const c = t.closest<HTMLElement>('.cat')?.dataset.c;
      if (t.closest('.grp-toggle') && g) return store.update((s) => toggleCollapsed(s, g));
      if (t.closest('.only') && c) { store.update((s) => toggleOnly(s, c, all)); void this.longPressTip(); return; }
      if (t.closest('.next') && c) return this.d.onNextUnfound(c);
    });
    body.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.classList.contains('grp-cb')) {
        const g = t.closest<HTMLElement>('.grp')!.dataset.g!;
        const ids = this.cats.filter((c) => c.group === g).map((c) => c.id);
        store.update((s) => setGroup(s, ids, t.checked));
      } else if (t.classList.contains('cat-cb')) {
        store.update((s) => setCategory(s, t.closest<HTMLElement>('.cat')!.dataset.c!, t.checked));
      }
    });
    // long-press a category row = Only
    let timer = 0, fired = false, sx = 0, sy = 0;
    body.addEventListener('pointerdown', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.cat');
      if (!row || (e.target as HTMLElement).closest('button')) return;
      fired = false; sx = e.clientX; sy = e.clientY;
      timer = window.setTimeout(() => {
        fired = true;
        navigator.vibrate?.(15);
        store.update((s) => toggleOnly(s, row.dataset.c!, all));
      }, LONG_PRESS_MS);
    });
    const cancel = () => clearTimeout(timer);
    body.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) cancel(); });
    body.addEventListener('pointerup', cancel);
    body.addEventListener('pointercancel', cancel);
    body.addEventListener('contextmenu', (e) => { if ((e.target as HTMLElement).closest('.cat')) e.preventDefault(); });
    // swallow the click that follows a long-press so it doesn't also toggle the checkbox
    body.addEventListener('click', (e) => { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
  }

  private async longPressTip() {
    if (await getSetting('tip.longpress', false)) return;
    await setSetting('tip.longpress', true);
    toast('Tip: long-press a category to show only it');
  }

  /** Refresh checkboxes, labels, counts and bars from state (no re-render). */
  sync() {
    const s = this.d.store.state;
    const { perCat, perGroup } = this.d.counts();
    const body = this.sheet.body;
    const allHidden = s.hidden.length >= this.d.store.allIds.length;
    body.querySelector('[data-act="all"]')!.textContent = allHidden ? 'Show all' : 'Hide all';
    const f = body.querySelector<HTMLElement>('[data-act="found"]')!;
    f.textContent = s.hideFound ? 'Show found' : 'Hide found';
    f.setAttribute('aria-pressed', String(s.hideFound));

    for (const sec of body.querySelectorAll<HTMLElement>('.grp')) {
      const g = sec.dataset.g!;
      const ids = this.cats.filter((c) => c.group === g).map((c) => c.id);
      const vis = ids.filter((id) => isVisible(s, id)).length;
      const cb = sec.querySelector<HTMLInputElement>('.grp-cb')!;
      cb.checked = vis === ids.length;
      cb.indeterminate = vis > 0 && vis < ids.length;
      const collapsed = s.collapsed.includes(g);
      sec.classList.toggle('collapsed', collapsed);
      sec.querySelector('.grp-toggle')!.setAttribute('aria-expanded', String(!collapsed));
      const gc = perGroup.get(g);
      sec.querySelector('.grp-count')!.textContent = gc ? `${gc.found} / ${gc.total}` : '';
      sec.querySelector<HTMLElement>('.grp-bar i')!.style.width = `${pct(gc)}%`;
      sec.querySelector<HTMLElement>('.grp-bar')!.hidden = !gc;
    }
    for (const li of body.querySelectorAll<HTMLElement>('.cat')) {
      const id = li.dataset.c!;
      const c = this.cats.find((x) => x.id === id)!;
      const pc = perCat.get(id) ?? { found: 0, total: 0 };
      li.querySelector<HTMLInputElement>('.cat-cb')!.checked = isVisible(s, id);
      li.classList.toggle('off', !isVisible(s, id));
      li.querySelector('.cat-count')!.textContent = c.trackable ? `found ${pc.found} / ${pc.total}` : `${pc.total}`;
      const bar = li.querySelector<HTMLElement>('.bar i');
      if (bar) bar.style.width = `${pct(pc)}%`;
      const only = li.querySelector<HTMLElement>('.only')!;
      const isOnly = s.only === id;
      only.textContent = isOnly ? 'All' : 'Only';
      only.setAttribute('aria-pressed', String(isOnly));
      only.setAttribute('aria-label', isOnly ? 'Show all categories' : `Show only ${c.name}`);
      const next = li.querySelector<HTMLButtonElement>('.next');
      if (next) next.disabled = pc.total > 0 && pc.found >= pc.total;
    }
  }
}
