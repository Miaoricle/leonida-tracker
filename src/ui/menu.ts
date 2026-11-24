import type { Category, Group, Marker } from '../data/types';
import { MAX_PROFILES, type ProgressStore, type Counts } from '../state/progress';
import { glyphSvg, hitIco } from '../icons/pin';
import { Sheet } from './sheet';
import { dialog } from './dialog';
import { toast } from './toast';

export interface MenuDeps {
  progress: ProgressStore;
  groups: Group[];
  categories: Category[];
  markerById: (id: string) => Marker | undefined;
  markersOf: (catId: string) => Marker[];
  counts: () => { perCat: Map<string, Counts>; perGroup: Map<string, Counts> };
  onOpenMarker: (m: Marker) => void;
  onMyMap?: () => void;
  onSettings?: () => void;
  onVehicles?: () => void;
  onWeapons?: () => void;
  onMissions?: () => void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pct = (c?: Counts) => (c && c.total ? Math.round((c.found / c.total) * 100) : 0);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export class Menu {
  readonly sheet: Sheet;
  readonly stats: Sheet;
  readonly profiles: Sheet;
  readonly about: Sheet;

  constructor(private d: MenuDeps) {
    this.sheet = new Sheet({ id: 'menu', title: 'Menu' });
    this.stats = new Sheet({ id: 'stats', title: 'Stats' });
    this.profiles = new Sheet({ id: 'profiles', title: 'Profiles' });
    this.about = new Sheet({ id: 'about', title: 'About' });
    this.renderMenu();
    this.renderAbout();
    d.progress.on(() => {
      this.renderMenu();
      if (this.stats.snap !== 'closed') this.renderStats();
      if (this.profiles.snap !== 'closed') this.renderProfiles();
    });
    this.stats.body.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-m]')?.dataset.m;
      const m = id && d.markerById(id);
      if (m) { this.stats.close(); d.onOpenMarker(m); }
    });
    this.profiles.body.addEventListener('click', (e) => void this.onProfileClick(e));
  }

  open() { this.renderMenu(); this.sheet.open('full'); } // 7 entries don't fit at half height on a phone

  private renderMenu() {
    const p = this.d.progress.profile;
    this.sheet.body.innerHTML = `
      <ul class="menu">
        <li><button data-go="mymap">${glyphSvg('bookmark', 22)}<span>My Map<small>Personal markers, favourites, notes</small></span></button></li>
        ${this.d.onVehicles ? `<li><button data-go="vehicles">${glyphSvg('directions_car', 22)}<span>Vehicles<small>All GTA 6 vehicles: stats, price, tracker</small></span></button></li>` : ''}
        ${this.d.onWeapons ? `<li><button data-go="weapons">${glyphSvg('swords', 22)}<span>Weapons<small>All GTA 6 weapons: stats, price, where to get</small></span></button></li>` : ''}
        ${this.d.onMissions ? `<li><button data-go="missions">${glyphSvg('flag', 22)}<span>Missions<small>Story mission checklist &amp; walkthroughs</small></span></button></li>` : ''}
        <li><button data-go="stats">${glyphSvg('bar_chart', 22)}<span>Stats</span></button></li>
        <li><button data-go="profiles">${glyphSvg('person', 22)}<span>Profiles<small>${esc(p.name)}</small></span></button></li>
        <li><button data-go="reset">${glyphSvg('restart_alt', 22)}<span>Reset progress</span></button></li>
        <li><button data-go="settings">${glyphSvg('settings', 22)}<span>Settings<small>Data source, backup, tools</small></span></button></li>
        <li><button data-go="about">${glyphSvg('info', 22)}<span>About &amp; credits</span></button></li>
      </ul>`;
    this.sheet.body.querySelector('.menu')!.addEventListener('click', (e) => {
      const go = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')?.dataset.go;
      if (go === 'stats') { this.sheet.close(); this.renderStats(); this.stats.open('full'); }
      if (go === 'profiles') { this.sheet.close(); this.renderProfiles(); this.profiles.open('half'); }
      if (go === 'reset') void this.reset();
      if (go === 'about') { this.sheet.close(); this.about.open('half'); }
      if (go === 'vehicles') { this.sheet.close(); this.d.onVehicles?.(); }
      if (go === 'weapons') { this.sheet.close(); this.d.onWeapons?.(); }
      if (go === 'missions') { this.sheet.close(); this.d.onMissions?.(); }
      if (go === 'mymap') { this.sheet.close(); this.d.onMyMap?.(); }
      if (go === 'settings') { this.sheet.close(); this.d.onSettings?.(); }
    });
  }

  renderStats() {
    const { perCat, perGroup } = this.d.counts();
    let all: Counts = { found: 0, total: 0 };
    for (const c of perGroup.values()) all = { found: all.found + c.found, total: all.total + c.total };
    const recent = this.d.progress.recent(12).map((r) => ({ ...r, m: this.d.markerById(r.markerId) })).filter((r) => r.m);
    const groups = [...this.d.groups].sort((a, b) => a.order - b.order).filter((g) => perGroup.get(g.id)?.total);
    const done = this.d.categories.filter((c) => c.trackable && (perCat.get(c.id)?.total ?? 0) > 0 && perCat.get(c.id)!.found === perCat.get(c.id)!.total);
    this.stats.titleEl.textContent = `Stats · ${this.d.progress.profile.name}`;
    this.stats.body.innerHTML = `
      <div class="stats">
        <div class="ring" style="--p:${pct(all)}" role="img" aria-label="${pct(all)}% complete">
          <span><b>${all.found && !pct(all) ? "<1" : pct(all)}%</b><small>${all.found.toLocaleString()} / ${all.total.toLocaleString()}</small></span>
        </div>
        <p class="stats-sub">${done.length} categor${done.length === 1 ? 'y' : 'ies'} complete</p>
        <h3 class="sec-h">By group</h3>
        <ul class="stat-groups">${groups.map((g) => { const c = perGroup.get(g.id)!; return `
          <li style="--c:${g.color}"><div class="sg-row"><span>${esc(g.name)}</span><span>${c.found} / ${c.total} · ${pct(c)}%</span></div><span class="bar"><i style="width:${pct(c)}%"></i></span></li>`; }).join('')}
        </ul>
        <h3 class="sec-h">Recent finds</h3>
        ${recent.length ? `<ul class="recent">${recent.map((r) => { const c = this.d.categories.find((x) => x.id === r.m!.category); return `
          <li><button class="hit" data-m="${esc(r.markerId)}">${hitIco(r.m!.category, c?.color ?? '#888')}
            <span class="hit-text"><b>${esc(r.m!.name)}</b><small>${esc(c?.name ?? '')} · ${when(r.foundAt)}</small></span></button></li>`; }).join('')}</ul>`
          : '<p class="muted">Nothing found yet. Tap a marker and press <b>Mark as found</b>.</p>'}
      </div>`;
  }

  private renderProfiles() {
    const { profiles, profile } = this.d.progress;
    this.profiles.body.innerHTML = `
      <p class="muted">Separate progress, favourites and notes for up to ${MAX_PROFILES} playthroughs.</p>
      <ul class="profiles">${profiles.map((p) => `
        <li class="${p.id === profile.id ? 'active' : ''}">
          <button class="prof-pick" data-p="${p.id}" aria-pressed="${p.id === profile.id}">
            <span class="radio" aria-hidden="true"></span><span>${esc(p.name)}</span>
          </button>
          <button class="icon-btn" data-rename="${p.id}" aria-label="Rename ${esc(p.name)}">${glyphSvg('edit', 20)}</button>
          ${profiles.length > 1 ? `<button class="icon-btn" data-del="${p.id}" aria-label="Delete ${esc(p.name)}">${glyphSvg('delete', 20)}</button>` : ''}
        </li>`).join('')}
      </ul>
      ${profiles.length < MAX_PROFILES ? `<button class="pill wide" data-new>${glyphSvg('add', 20)} New profile</button>` : `<p class="muted">Maximum of ${MAX_PROFILES} profiles reached.</p>`}`;
  }

  private async onProfileClick(e: Event) {
    const t = e.target as HTMLElement;
    const pr = this.d.progress;
    const pick = t.closest<HTMLElement>('[data-p]')?.dataset.p;
    const ren = t.closest<HTMLElement>('[data-rename]')?.dataset.rename;
    const del = t.closest<HTMLElement>('[data-del]')?.dataset.del;
    if (pick && pick !== pr.profile.id) {
      await pr.switchProfile(pick);
      toast(`Switched to ${pr.profile.name}`);
    } else if (ren) {
      const p = pr.profiles.find((x) => x.id === ren)!;
      const name = await dialog({ title: 'Rename profile', input: { label: 'Name', value: p.name }, confirm: 'Save' });
      if (typeof name === 'string') await pr.renameProfile(ren, name);
    } else if (del) {
      const p = pr.profiles.find((x) => x.id === del)!;
      const ok = await dialog({ title: `Delete "${p.name}"?`, message: 'Its progress, favourites and notes will be deleted. There is no undo.', confirm: 'Delete', danger: true });
      if (ok) { await pr.deleteProfile(del); toast('Profile deleted'); }
    } else if (t.closest('[data-new]')) {
      const name = await dialog({ title: 'New profile', input: { label: 'Name', placeholder: `Playthrough ${pr.profiles.length + 1}` }, confirm: 'Create' });
      if (typeof name === 'string') {
        const p = await pr.createProfile(name);
        await pr.switchProfile(p.id);
        toast(`Switched to ${p.name}`);
      }
    }
    this.renderProfiles();
  }

  private async reset() {
    const { perCat } = this.d.counts();
    const cats = this.d.categories.filter((c) => c.trackable && (perCat.get(c.id)?.found ?? 0) > 0).sort((a, b) => a.name.localeCompare(b.name));
    const pr = this.d.progress;
    if (!pr.found.size) { toast('Nothing to reset'); return; }
    const choice = await dialog({
      title: 'Reset progress',
      message: `Choose what to reset in "${pr.profile.name}".`,
      select: { label: 'Reset', options: [{ value: '*', label: `All categories (${pr.found.size} found)` }, ...cats.map((c) => ({ value: c.id, label: `${c.name} (${perCat.get(c.id)!.found} found)` }))] },
      confirm: 'Continue',
    });
    if (typeof choice !== 'string') return;
    const label = choice === '*' ? 'all categories' : this.d.categories.find((c) => c.id === choice)!.name;
    const ok = await dialog({ title: `Reset ${label}?`, message: 'Found markers will be unticked. There is no undo.', confirm: 'Reset', danger: true });
    if (!ok) return;
    const n = await pr.reset(choice === '*' ? undefined : this.d.markersOf(choice).map((m) => m.id));
    this.sheet.close();
    toast(`Reset ${n} marker${n === 1 ? '' : 's'}`);
  }

  private renderAbout() {
    this.about.body.innerHTML = `
      <div class="about">
        <p><b>Leonida Tracker</b>: a personal, ad-free GTA 6 map tracker.</p>
        <ul class="credits">
          <li>Locations &amp; screenshots: <a href="https://www.gtabase.com/gta-6/map/" target="_blank" rel="noopener">GTABase.com</a>, used with the owner's permission for personal use</li>
          <li>Map tiles: <a href="https://gtadb.org" target="_blank" rel="noopener">gtadb.org</a> and contributors (CC BY 4.0)</li>
          <li>Icons: Google Material Symbols (Apache 2.0)</li>
          <li>Map blips (from your private data): in-game icons from Grand Theft Auto VI © Rockstar Games, via GTABase</li>
          <li>Fan project, not affiliated with Rockstar Games or Take-Two.</li>
        </ul>
      </div>`;
  }
}
