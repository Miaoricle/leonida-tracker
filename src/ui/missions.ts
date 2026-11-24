// Missions tab: the GTA 6 story mission checklist (GTABase guide), by chapter, with walkthroughs.
// Ticks are stored with found markers (per profile, included in backups).
// No-spoilers mode (on by default): for missions you haven't completed, only what GTABase's spoiler-free mission
// list shows (name, chapter, who you play, short summary, optional / missable tags). Walkthrough, pictures, rewards
// and who's in it stay hidden until you complete the mission, or tap "Show" on that one mission.
import { glyphSvg } from '../icons/pin';
import { shotUrl } from '../data/images';
import { type Mission, type MissionQuery, loadMissions, missionKey, queryMissions, missionProgress, missableBefore } from '../data/missions';
import type { ProgressStore } from '../state/progress';
import { getSetting, setSetting } from '../db';
import { trapFocus } from './focus';
import { syncUrl } from '../deeplink';
import { ViewMemory } from './viewmemory';
import { toast } from './toast';
import { openViewer } from './viewer';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const HIDE = /^(chapter|rewards|protagonist \(playable\))$/i;
/** info that is safe before playing a mission */
const SAFE_INFO = /^(mission type|required for 100%)$/i;

export class MissionsView {
  readonly el: HTMLElement;
  private list: Mission[] = [];
  private q: MissionQuery = { kind: 'all' };
  private release: (() => void) | null = null;
  private returnFocus: HTMLElement | null = null;
  private current: Mission | null = null;
  private timer = 0;
  private mem: ViewMemory;
  private io: IntersectionObserver;
  private noSpoil = true;
  /** missions whose spoilers you chose to show (this session) */
  private revealed = new Set<string>();

  constructor(private progress: ProgressStore, private load: () => Promise<Mission[]> = loadMissions) {
    this.el = document.createElement('div');
    this.el.className = 'vehicles missions';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Missions');
    document.body.appendChild(this.el);
    this.mem = new ViewMemory(this.el, () => this.current === null);
    // pictures load only when they scroll into view (list) or a walkthrough step is opened
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const img = e.target as HTMLImageElement;
        this.io.unobserve(img);
        void shotUrl(img.dataset.src).then((u) => { if (u) { img.src = u; img.parentElement?.classList.remove('loading'); } else img.parentElement?.classList.add('noimg'); });
      }
    }, { rootMargin: '400px 0px' });
    this.el.addEventListener('toggle', (e) => {
      const d = e.target as HTMLDetailsElement;
      if (d.open) d.querySelectorAll<HTMLImageElement>('img[data-src]').forEach((img) => this.io.observe(img));
    }, true);
    this.el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (this.current) this.showList(); else this.close();
    });
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.classList.contains('v-search')) { clearTimeout(this.timer); this.timer = window.setTimeout(() => { this.q.text = t.value; this.renderList(); }, 120); }
    });
    this.el.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.classList.contains('ms-hide')) { this.q.hideDone = t.checked; this.save(); this.renderList(); }
      if (t.classList.contains('ms-spoil')) { this.noSpoil = t.checked; void setSetting('missions.noSpoilers', this.noSpoil); this.showList(); }
    });
    // a profile switch / reset / backup import changes ticks
    progress.on(() => { if (!this.el.hidden) { if (this.current) this.showDetail(this.current, true); else this.showList(); } });
  }

  private done = (m: Mission) => this.progress.isFound(missionKey(m));
  /** hide spoilers for this mission? */
  private safe = (m: Mission) => this.noSpoil && !this.done(m) && !this.revealed.has(m.slug);
  private save() { void setSetting('missions.query', { kind: this.q.kind, hideDone: this.q.hideDone }); }

  async open(slug?: string) {
    this.returnFocus = document.activeElement as HTMLElement | null;
    if (!this.list.length) {
      this.list = (await this.load()).sort((a, b) => a.order - b.order);
      this.q = { ...this.q, ...(await getSetting<Partial<MissionQuery>>('missions.query', {})) };
      this.noSpoil = await getSetting<boolean>('missions.noSpoilers', true);
    }
    this.el.hidden = false;
    this.release = trapFocus(this.el);
    // a plain open (tab bar) resumes where you left the tab: the same mission, or the list at the same spot
    const resume = !slug && this.mem.resume ? this.list.find((x) => x.slug === this.mem.resume) : undefined;
    const m = slug ? this.list.find((x) => x.slug === slug) : resume;
    if (m) this.showDetail(m, !!resume); else this.showList();
  }

  close() {
    this.mem.resume = this.current?.slug ?? null;
    this.el.hidden = true;
    this.current = null;
    this.release?.();
    syncUrl({ ms: null });
    this.returnFocus?.focus?.({ preventScroll: true });
  }

  private header(title: string, back = false) {
    return `<header class="v-head">
      ${back ? `<button class="icon-btn v-back" aria-label="Back to list">${glyphSvg('chevron_left', 26)}</button>` : ''}
      <h2>${title}</h2>
      <button class="icon-btn v-close" aria-label="Close missions">${glyphSvg('close', 24)}</button>
    </header>`;
  }

  /** colour of the no-spoiler tile: who you play */
  private who(m: Mission) {
    const p = (m.protagonists ?? []).join(' ');
    return /jason/i.test(p) && /lucia/i.test(p) ? 'both' : /lucia/i.test(p) ? 'lucia' : /jason/i.test(p) ? 'jason' : '';
  }

  private badges(m: Mission) {
    return [m.optional ? '<span class="ms-b opt">Optional</span>' : '', m.missable ? '<span class="ms-b miss">Missable</span>' : '',
      m.pointOfNoReturn ? '<span class="ms-b ponr">Point of no return</span>' : ''].join('');
  }

  // ---------- list ----------
  private showList() {
    this.current = null;
    syncUrl({ ms: null });
    if (!this.list.length) {
      this.el.innerHTML = `${this.header('Missions')}<div class="v-empty"><p>No mission data yet.</p><p class="muted">Run <b>Sync GTABase</b> in your leonida-data repo, then <b>Menu → Settings → Check for updates</b>.</p></div>`;
      return;
    }
    const p = missionProgress(this.list, this.done);
    const opt = this.list.filter((m) => m.optional).length, miss = this.list.filter((m) => m.missable).length;
    this.el.innerHTML = `
      ${this.header(`Missions <small>${p.done}/${p.total}</small>`)}
      <div class="v-tools">
        <div class="ms-total"><span class="bar"><i style="width:${(p.done / p.total) * 100}%"></i></span><b>${Math.round((p.done / p.total) * 100)}%</b></div>
        <label class="v-searchbox">${glyphSvg('search', 20)}<input class="v-search" type="search" placeholder="Search missions, characters" aria-label="Search missions" value="${esc(this.q.text ?? '')}" autocomplete="off" spellcheck="false"></label>
        <div class="seg v-type" role="radiogroup">${([['all', 'All'], ['main', 'Story'], ['optional', `Optional (${opt})`], ['missable', `Missable (${miss})`]] as const).map(([v, l]) => `<button role="radio" data-kind="${v}" aria-checked="${(this.q.kind ?? 'all') === v}">${l}</button>`).join('')}</div>
        <div class="ms-opts">
          <label class="ms-hidebox"><input type="checkbox" class="ms-hide" ${this.q.hideDone ? 'checked' : ''}> Hide completed</label>
          <label class="ms-hidebox"><input type="checkbox" class="ms-spoil" ${this.noSpoil ? 'checked' : ''}> No spoilers</label>
        </div>
        ${this.noSpoil ? `<p class="ms-nospoil">${glyphSvg('visibility_off', 18)}<span><b>No spoilers:</b> this list contains no story spoilers, so you can safely browse it and keep track of the missions you've completed. Walkthroughs, pictures and rewards unlock when you complete a mission.</span></p>` : ''}
      </div>
      <div class="ms-list"></div>`;
    this.renderList();
    this.mem.restoreList('data-ms'); // back from a mission, or re-render after a tick: same spot
  }

  private renderList() {
    const box = this.el.querySelector('.ms-list');
    if (!box) return;
    const rows = queryMissions(this.list, { ...this.q, noSpoilers: this.noSpoil }, this.done);
    const p = missionProgress(this.list, this.done);
    const byChapter = new Map<string, Mission[]>();
    for (const m of rows) byChapter.set(m.chapter, [...(byChapter.get(m.chapter) ?? []), m]);
    box.innerHTML = rows.length ? [...byChapter].map(([ch, ms]) => {
      const c = p.chapters.get(ch)!;
      return `<section class="ms-ch"><h3 class="sec-h">${esc(ch)} <small>${c.done}/${c.total}</small></h3><ul class="ms-rows">${ms.map((m) => {
        const d = this.done(m);
        return `<li class="ms-row${d ? ' done' : ''}">
          <button class="ms-tick" data-tick="${esc(m.slug)}" role="checkbox" aria-checked="${d}" aria-label="${esc(m.name)} done">${glyphSvg('check', 20)}</button>
          <button class="ms-open" data-ms="${esc(m.slug)}">
            ${this.safe(m) ? `<span class="ms-thumb ms-safe ${this.who(m)}" aria-hidden="true">${m.number ?? '★'}</span>` : `<span class="ms-thumb v-thumb loading"><img alt="" data-src="${esc(m.thumbnail ?? m.image ?? '')}"></span>`}
            <span class="ms-name">${m.number ? `<span class="ms-n">${m.number}.</span> ` : ''}${esc(m.name)}</span>
            <span class="ms-sub">${esc((m.protagonists ?? []).map((x) => x.split(' ')[0]).join(' & '))}${this.badges(m)}</span>
          </button>
        </li>`;
      }).join('')}</ul></section>`;
    }).join('') : '<p class="v-none muted">No mission matches these filters.</p>';
    box.querySelectorAll<HTMLImageElement>('img[data-src]').forEach((img) => this.io.observe(img));
  }

  // ---------- detail ----------
  private showDetail(m: Mission, keepScroll = false) {
    const y = this.mem.enterDetail(m.slug, keepScroll);
    this.current = m;
    syncUrl({ ms: m.slug });
    const d = this.done(m);
    const i = this.list.indexOf(m);
    const prev = this.list[i - 1], next = this.list[i + 1];
    const safe = this.safe(m);
    const info = (m.fields ?? []).filter((f) => !HIDE.test(f.label) && (!safe || SAFE_INFO.test(f.label)));
    const hidden = [m.steps?.length ? 'walkthrough' : '', m.image ? 'pictures' : '', m.rewards?.length ? 'rewards' : '', (m.fields ?? []).some((f) => /giver|featuring/i.test(f.label)) ? "who's in it" : ''].filter(Boolean);
    const warn = m.pointOfNoReturn ? missableBefore(this.list, m, this.done) : [];
    this.el.innerHTML = `
      ${this.header(`${m.number ? `${m.number}. ` : ''}${esc(m.name)}`, true)}
      <div class="v-detail">
        ${safe ? '' : `<div class="v-hero loading"><img alt="${esc(m.name)}"></div>`}
        <div class="v-tags"><span class="chip">${esc(m.chapter)}</span>${(m.protagonists ?? []).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}${this.badges(m)}</div>
        <button class="found-btn ms-done${d ? ' on' : ''}" aria-pressed="${d}"><span class="found-ico">${glyphSvg('check', 24)}</span><span class="found-label">${d ? 'Completed' : 'Mark as completed'}</span></button>
        ${m.pointOfNoReturn ? `<p class="ms-warn">${glyphSvg('info', 18)} Point of no return: missable missions in ${esc(m.chapter)} can't be done after this.${warn.length ? ` Still to do: ${warn.map((w) => `<button class="link-btn" data-ms="${esc(w.slug)}">${esc(w.name)}</button>`).join(', ')}.` : ''}</p>` : ''}
        ${m.missable ? '<p class="ms-warn">' + glyphSvg('info', 18) + ' Missable: do it before this chapter\'s point of no return.</p>' : ''}
        ${m.summary ? `<p class="v-desc">${esc(m.summary)}</p>` : ''}
        ${info.length ? `<h3 class="sec-h">Info</h3><dl class="v-kv">${info.map((f) => `<dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd>`).join('')}</dl>` : ''}
        ${safe && hidden.length ? `<div class="ms-spoilbox">${glyphSvg('visibility_off', 22)}<p>Hidden to avoid spoilers: ${hidden.join(', ')}. They show automatically once you complete this mission.</p><button class="pill ms-reveal">${glyphSvg('visibility', 18)} Show for this mission</button></div>` : ''}
        ${!safe && m.rewards?.length ? `<h3 class="sec-h">Rewards</h3><ul class="ms-rewards">${m.rewards.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
        ${!safe && m.steps?.length ? `<h3 class="sec-h">Walkthrough <small>(${m.steps.length} steps)</small></h3><ol class="ms-steps">${m.steps.map((s) => `<li><details><summary>${esc(s.title)}</summary>${s.text ? s.text.split('\n').map((t) => `<p>${esc(t)}</p>`).join('') : ''}${(s.images ?? []).map((i) => `<button class="ms-shot v-thumb loading" data-full="${esc(i.url)}" aria-label="View picture full screen"><img alt="${esc(i.alt ?? '')}" data-src="${esc(i.url)}"></button>`).join('')}</details></li>`).join('')}</ol>` : ''}
        <div class="card-nav">
          <button class="pill ms-nav" data-ms="${esc(prev?.slug ?? '')}" ${prev ? '' : 'disabled'}>${glyphSvg('chevron_left', 20)} Previous</button>
          <button class="pill ms-nav" data-ms="${esc(next?.slug ?? '')}" ${next ? '' : 'disabled'}>Next ${glyphSvg('chevron_right', 20)}</button>
        </div>
        <p class="card-credit"><a href="${esc(m.url)}" target="_blank" rel="noopener">Full guide on GTABase</a> · Mission guide: GTABase.com</p>
      </div>`;
    const hero = this.el.querySelector<HTMLImageElement>('.v-hero img');
    if (hero) void shotUrl(m.image).then((u) => {
      if (this.current?.id !== m.id) return;
      if (u) { hero.src = u; hero.parentElement!.classList.remove('loading'); } else hero.parentElement!.remove();
    });
    this.el.scrollTop = y;
    if (!keepScroll) this.el.querySelector<HTMLElement>('.v-back')?.focus({ preventScroll: true });
  }

  private toggle(m: Mission) {
    const on = !this.done(m);
    navigator.vibrate?.(15);
    void this.progress.setFound(missionKey(m), on);
    if (on && m.pointOfNoReturn) {
      const left = missableBefore(this.list, m, this.done);
      if (left.length) toast(`Heads up: ${left.length} missable mission${left.length > 1 ? 's' : ''} in ${m.chapter} not done`, { ms: 6000 });
    }
  }

  private onClick(e: Event) {
    const t = e.target as HTMLElement;
    if (t.closest('.v-close')) return this.close();
    if (t.closest('.v-back')) return this.showList();
    const kind = t.closest<HTMLElement>('[data-kind]')?.dataset.kind as MissionQuery['kind'];
    if (kind) {
      this.q.kind = kind;
      t.closest('.v-type')!.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-checked', String((b as HTMLElement).dataset.kind === kind)));
      this.save();
      this.renderList();
      return;
    }
    const full = t.closest<HTMLElement>('[data-full]');
    if (full) { const img = full.querySelector('img'); if (img?.src) openViewer(img.src, img.alt || 'Mission picture'); return; }
    const tick = t.closest<HTMLElement>('[data-tick]')?.dataset.tick;
    if (tick) { const m = this.list.find((x) => x.slug === tick); if (m) this.toggle(m); return; }
    if (t.closest('.ms-done') && this.current) { this.toggle(this.current); return; }
    if (t.closest('.ms-reveal') && this.current) { this.revealed.add(this.current.slug); this.showDetail(this.current, true); return; }
    const slug = t.closest<HTMLElement>('[data-ms]')?.dataset.ms;
    const m = slug ? this.list.find((x) => x.slug === slug) : undefined;
    if (m) this.showDetail(m);
  }
}
