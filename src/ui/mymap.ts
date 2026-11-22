import type { Category, Marker } from '../data/types';
import type { ProgressStore } from '../state/progress';
import type { PersonalStore } from '../state/personal';
import { CUSTOM_COLOR } from '../state/personal';
import { glyphSvg } from '../icons/pin';
import { iconFor } from '../icons/mapping';
import { Sheet } from './sheet';

type Tab = 'personal' | 'favourites' | 'notes';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class MyMapView {
  readonly sheet: Sheet;
  private tab: Tab = 'personal';

  constructor(private d: {
    progress: ProgressStore; personal: PersonalStore; category: (id: string) => Category | undefined;
    marker: (id: string) => Marker | undefined; onOpen: (m: Marker) => void;
  }) {
    this.sheet = new Sheet({ id: 'mymap', title: 'My Map' });
    this.sheet.body.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const tab = t.closest<HTMLElement>('[data-tab]')?.dataset.tab as Tab | undefined;
      if (tab) { this.tab = tab; this.render(); return; }
      const id = t.closest<HTMLElement>('[data-m]')?.dataset.m;
      const m = id ? this.d.marker(id) : undefined;
      if (m) { this.sheet.close(); this.d.onOpen(m); }
    });
    this.sheet.body.addEventListener('keydown', (e) => {
      const tabs = [...this.sheet.body.querySelectorAll<HTMLElement>('[role=tab]')];
      const i = tabs.indexOf(document.activeElement as HTMLElement);
      if (i < 0 || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.click(); next.focus();
    });
    d.personal.on(() => this.sheet.snap !== 'closed' && this.render());
    d.progress.on(() => this.sheet.snap !== 'closed' && this.render());
  }

  open(tab?: Tab) { if (tab) this.tab = tab; this.render(); this.sheet.open('half'); }

  private render() {
    const { progress, personal } = this.d;
    const lists: Record<Tab, Marker[]> = {
      personal: [...personal.list].sort((a, b) => a.name.localeCompare(b.name)),
      favourites: [...progress.favourites].map((id) => this.d.marker(id)).filter(Boolean) as Marker[],
      notes: [...progress.notes.keys()].map((id) => this.d.marker(id)).filter(Boolean) as Marker[],
    };
    const label: Record<Tab, string> = { personal: 'Personal', favourites: 'Favourites', notes: 'Notes' };
    const empty: Record<Tab, string> = {
      personal: 'No personal markers yet. Long-press the map and choose <b>Add personal marker</b>.',
      favourites: 'No favourites yet. Tap ★ on a marker card.',
      notes: 'No notes yet. Write one on a marker card.',
    };
    const list = lists[this.tab];
    this.sheet.body.innerHTML = `
      <div class="tabs" role="tablist">${(Object.keys(label) as Tab[]).map((t) => `
        <button role="tab" data-tab="${t}" aria-selected="${t === this.tab}" tabindex="${t === this.tab ? 0 : -1}">${label[t]} <span class="tab-n">${lists[t].length}</span></button>`).join('')}
      </div>
      <div role="tabpanel">
        ${list.length ? `<ul class="recent">${list.map((m) => this.row(m)).join('')}</ul>` : `<p class="muted">${empty[this.tab]}</p>`}
      </div>`;
  }

  private row(m: Marker) {
    const c = this.d.category(m.category);
    const user = m.source === 'user';
    const sub = this.tab === 'notes' ? this.d.progress.note(m.id) : user ? String(m.customCategory ?? c?.name ?? 'My marker') : c?.name ?? '';
    return `<li><button class="hit" data-m="${esc(m.id)}">
      <span class="hit-ico" style="--c:${c?.color ?? CUSTOM_COLOR}">${glyphSvg(iconFor(user && m.customCategory ? 'custom' : m.category), 18)}</span>
      <span class="hit-text"><b>${esc(m.name)}${this.d.progress.isFound(m.id) ? ' ✓' : ''}</b><small>${esc(sub)}</small></span></button></li>`;
  }
}
