import { db, getSetting, setSetting } from '../db';
import type { Dataset } from '../data/types';
import { DEFAULT_REPO, testConnection, type RepoConfig } from '../data/github';
import { checkForUpdates, describeUpdate, repoConfig, type RemovedInfo, type UpdateResult } from '../data/store';
import { importDataFiles } from '../data/importfile';
import { exportBackup, importBackup, markBackedUp, parseBackup, saveJsonFile } from '../backup';
import type { ProgressStore } from '../state/progress';
import type { PrefStore } from '../state/prefs';
import { OfflineDownloader, estimate, mb, storageUsage, tileIndex, cachedTileCount } from '../offline';
import { wakeLockSupported } from '../wakelock';
import { thumbnailSources, prefetchShots } from '../data/images';
import { Sheet } from './sheet';
import { dialog } from './dialog';
import { toast } from './toast';

export interface SettingsDeps {
  data: () => Dataset | null;
  progress: ProgressStore | null;
  onDataChanged: (r: UpdateResult) => void;
  onBackupImported: () => void;
  coordPicker: { get: () => boolean; set: (on: boolean) => void };
  prefs?: PrefStore;
  hideFound?: { get: () => boolean; set: (on: boolean) => void };
  downloader?: OfflineDownloader;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'never');
const dayTime = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');

export class SettingsView {
  readonly sheet: Sheet;
  private busy = false;
  private shotStop: { stop: boolean } | null = null;

  constructor(private d: SettingsDeps) {
    this.sheet = new Sheet({ id: 'settings', title: 'Settings' });
    d.downloader?.on((st) => this.syncDownload(st));
    this.sheet.body.addEventListener('click', (e) => void this.onClick(e));
    this.sheet.body.addEventListener('change', (e) => void this.onChange(e));
  }

  async open(section?: 'data' | 'backup' | 'offline') {
    await this.render();
    this.sheet.open('full');
    if (section) this.sheet.body.querySelector(`#set-${section}`)?.scrollIntoView({ block: 'start' });
  }

  async render() {
    const ds = this.d.data();
    const token = await getSetting<string>('gh.token', '');
    const repo = { ...DEFAULT_REPO, ...(await getSetting('gh.repo', DEFAULT_REPO)) };
    const [lastSync, lastCheck, source, lastBackup] = await Promise.all([
      getSetting<string>('data.lastSync', ''), getSetting<string>('data.lastCheck', ''), getSetting<string>('data.source', ''), getSetting<string>('backup.lastAt', ''),
    ]);
    const removed = await this.removedRows();
    const synced = ds?.meta?.syncedAt;
    const p = this.d.prefs?.value;
    const idx = this.d.downloader?.supported ? await tileIndex().catch(() => null) : null;
    const seg = (name: string, cur: string, opts: [string, string][]) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) => `<button role="radio" data-pref="${name}" data-v="${v}" aria-checked="${v === cur}">${l}</button>`).join('')}</div>`;
    const dl = this.d.downloader?.state;
    this.sheet.body.innerHTML = `
      <div class="settings">
        ${p ? `<section id="set-display">
          <h3 class="sec-h">Display</h3>
          <div class="field"><span>Found markers</span>${seg('found', this.d.hideFound?.get() ? 'hide' : 'fade', [['fade', 'Faded'], ['hide', 'Hidden']])}</div>
          <div class="field"><span>Map colours</span>${seg('vividMap', p.vividMap ? 'on' : 'off', [['on', 'Vivid'], ['off', 'Original']])}</div>
          <div class="field"><span>Marker size</span>${seg('markerSize', p.markerSize, [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']])}</div>
          <div class="field"><span>Theme</span>${seg('theme', p.theme, [['dark', 'Dark'], ['light', 'Light'], ['system', 'System']])}</div>
          ${wakeLockSupported() ? `<label class="switch-row"><span>Keep screen awake<small>While the app is open</small></span><input type="checkbox" class="switch awake" ${p.keepAwake ? 'checked' : ''}></label>` : ''}
        </section>` : ''}
        ${idx ? `<section id="set-offline">
          <h3 class="sec-h">Offline map</h3>
          <p class="muted small">Markers and your progress always work offline. Map tiles you've viewed are cached; download the rest here.</p>
          <label class="field"><span>Download detail</span><select class="dl-zoom">${[4, 5, 6].map((z) => `<option value="${z}" ${(dl?.maxZoom ?? 5) === z ? 'selected' : ''}>${z === 4 ? 'Overview' : z === 5 ? 'Detailed' : 'Full detail'} (≈ ${mb(estimate(idx, z).bytes)})</option>`).join('')}</select></label>
          <div class="dl-progress" ${dl && dl.total ? '' : 'hidden'}><span class="bar"><i></i></span><small class="dl-text"></small></div>
          <div class="btn-row"><button class="pill primary" data-a="dl">${dl?.running ? 'Pause' : dl && dl.total && dl.done < dl.total ? 'Resume' : 'Download map for offline'}</button></div>
          <p class="muted small storage-line">Checking storage…</p>
          ${token ? '<div class="btn-row"><button class="pill" data-a="shots">Download screenshots for offline</button></div><p class="muted small shots-line" hidden></p>' : ''}
        </section>` : ''}
        <section id="set-data">
          <h3 class="sec-h">Data source</h3>
          <p class="status-line">${ds ? `<b>Synced ${day(synced)}, ${ds.markers.length.toLocaleString()} locations</b>` : '<b>No map data yet</b>'}
            <small>${ds ? `${source === 'import' ? 'From an imported file' : source === 'github' ? 'From your private repo' : 'Local dev copy'} · fetched ${dayTime(lastSync)} · last check ${dayTime(lastCheck)}` : 'Add your token below, or import the data file.'}</small></p>
          <label class="field"><span>Private data repo</span><input class="repo" value="${esc(`${repo.owner}/${repo.repo}`)}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
          <label class="field"><span>GitHub token ${token ? `<em>(saved, ends …${esc(token.slice(-4))})</em>` : ''}</span>
            <input class="token" type="password" placeholder="${token ? 'Paste a new token to replace it' : 'github_pat_…'}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
          <p class="muted small">Fine-grained token, <b>Contents: Read-only</b> on leonida-data only. Stored on this device and sent only to api.github.com. On iPhone, enter it inside the home-screen app (it has its own storage).</p>
          <div class="btn-row">
            <button class="pill primary" data-a="test">Save &amp; test connection</button>
            <button class="pill" data-a="check" ${token ? '' : 'disabled'}>Check for updates</button>
          </div>
          ${token ? '<button class="link-btn" data-a="forget-token">Remove token from this device</button>' : ''}
          <h3 class="sec-h">Import data file</h3>
          <p class="muted small">No token? Pick <code>markers.json</code> and <code>categories.json</code> (plus <code>labels.json</code>, <code>meta.json</code>) from the Files app.</p>
          <label class="pill file-pill">Choose files…<input type="file" class="data-file" accept=".json,application/json" multiple hidden></label>
        </section>

        <section id="set-backup">
          <h3 class="sec-h">Backup</h3>
          <p class="muted small">Your progress, notes, favourites, personal markers and profiles. Last backup: <b>${day(lastBackup)}</b>.
            Keep a copy in iCloud Drive / Files. Deleting the home-screen app deletes its data.</p>
          <div class="btn-row">
            <button class="pill primary" data-a="export">Export backup</button>
            <label class="pill file-pill">Import backup<input type="file" class="backup-file" accept=".json,application/json" hidden></label>
          </div>
        </section>

        <section id="set-removed">
          <h3 class="sec-h">Removed markers</h3>
          ${removed.length ? `<p class="muted small">Markers you ticked that a later sync removed. Their progress is kept.</p>
          <ul class="removed">${removed.map((r) => `<li><span><b>${esc(r.name)}</b><small>${esc(r.category)}${r.removedAt ? ` · removed ${day(r.removedAt)}` : ''}</small></span>
            <button class="link-btn" data-forget="${esc(r.id)}">Forget</button></li>`).join('')}</ul>` : '<p class="muted small">None. Every marker you\'ve ticked is still in the data.</p>'}
        </section>

        <section id="set-tools">
          <h3 class="sec-h">Tools</h3>
          <label class="switch-row"><span>Coordinate picker<small>Tap the map to show and copy game x, y</small></span>
            <input type="checkbox" class="switch coord" ${this.d.coordPicker.get() ? 'checked' : ''}></label>
        </section>
        <p class="muted small">Locations: GTABase.com (personal use, with permission) · Tiles: gtadb.org (CC BY 4.0) · Icons: Material Symbols</p>
      </div>`;
    this.syncDownload();
    void this.syncStorage();
  }

  private syncDownload(st = this.d.downloader?.state) {
    const box = this.sheet.body.querySelector<HTMLElement>('.dl-progress');
    if (!box || !st) return;
    box.hidden = !st.total;
    box.querySelector<HTMLElement>('.bar i')!.style.width = `${st.total ? Math.round((st.done / st.total) * 100) : 0}%`;
    box.querySelector('.dl-text')!.textContent = `${st.done.toLocaleString()} / ${st.total.toLocaleString()} tiles${st.failed ? ` · ${st.failed} failed` : ''}${!st.running && st.done >= st.total && st.total ? ' · done ✓' : ''}`;
    const b = this.sheet.body.querySelector<HTMLButtonElement>('[data-a="dl"]');
    if (b) b.textContent = st.running ? 'Pause' : st.total && st.done < st.total ? 'Resume' : 'Download map for offline';
    if (!st.running) void this.syncStorage();
  }

  private async syncStorage() {
    const el = this.sheet.body.querySelector('.storage-line');
    if (!el) return;
    const [u, n] = await Promise.all([storageUsage(), cachedTileCount()]);
    el.textContent = `${n.toLocaleString()} tiles cached${u ? ` · app storage ${mb(u.usage)} of ${mb(u.quota)} available` : ''}`;
  }

  private async removedRows() {
    const ds = this.d.data();
    const p = this.d.progress;
    if (!ds || !p) return [];
    const ids = new Set(ds.markers.map((m) => m.id));
    const snap = await getSetting<Record<string, RemovedInfo>>('data.removed', {});
    const personal = new Set((await db.personal.toArray()).map((m) => m.id));
    return [...p.found].filter((id) => !ids.has(id) && !personal.has(id))
      .map((id) => ({ id, name: snap[id]?.name ?? id, category: snap[id]?.category ?? 'unknown category', removedAt: snap[id]?.removedAt }));
  }

  private readRepo(): Omit<RepoConfig, 'token'> | null {
    const v = this.sheet.body.querySelector<HTMLInputElement>('.repo')!.value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
    const [owner, repo] = v.split('/');
    if (!owner || !repo) { toast('Repo should look like owner/name'); return null; }
    return { owner, repo, branch: 'main' };
  }

  private async run(label: string, fn: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    const btns = this.sheet.body.querySelectorAll<HTMLButtonElement>('button');
    btns.forEach((b) => (b.disabled = true));
    toast(label);
    try { await fn(); } catch (e) { toast((e as Error).message || 'Something went wrong', { ms: 5000 }); }
    finally { this.busy = false; await this.render(); }
  }

  private async onClick(e: Event) {
    const t = e.target as HTMLElement;
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    const forget = t.closest<HTMLElement>('[data-forget]')?.dataset.forget;
    const pref = t.closest<HTMLElement>('[data-pref]');
    if (pref) {
      const k = pref.dataset.pref!, v = pref.dataset.v!;
      if (k === 'found') this.d.hideFound?.set(v === 'hide');
      else if (k === 'vividMap') this.d.prefs?.set('vividMap', v === 'on');
      else this.d.prefs?.set(k as 'markerSize' | 'theme', v as never);
      pref.parentElement!.querySelectorAll('[data-pref]').forEach((b) => b.setAttribute('aria-checked', String(b === pref)));
      return;
    }
    if (a === 'shots') {
      const btn = t.closest<HTMLButtonElement>('[data-a="shots"]')!;
      const line = this.sheet.body.querySelector<HTMLElement>('.shots-line')!;
      if (this.shotStop) { this.shotStop.stop = true; return; }
      if (!navigator.onLine) { toast("You're offline"); return; }
      const list = await thumbnailSources();
      if (!list.length) { toast('No screenshots in your data yet (run the sync)'); return; }
      this.shotStop = { stop: false };
      btn.textContent = 'Stop';
      line.hidden = false;
      const n = await prefetchShots(list, (d, tot) => { line.textContent = `${d} / ${tot} screenshots`; }, this.shotStop);
      line.textContent = `${n} of ${list.length} screenshots saved on this device`;
      btn.textContent = 'Download screenshots for offline';
      this.shotStop = null;
      return;
    }
    if (a === 'dl' && this.d.downloader) {
      const dlr = this.d.downloader;
      if (dlr.state.running) dlr.pause();
      else {
        if (!navigator.onLine) { toast("You're offline"); return; }
        const z = +this.sheet.body.querySelector<HTMLSelectElement>('.dl-zoom')!.value;
        void navigator.storage?.persist?.();
        void dlr.start(z);
      }
      return;
    }
    if (a === 'test') {
      const repo = this.readRepo();
      if (!repo) return;
      const typed = this.sheet.body.querySelector<HTMLInputElement>('.token')!.value.trim();
      const token = typed || (await getSetting<string>('gh.token', ''));
      if (!token) { toast('Paste your token first'); return; }
      await this.run('Testing connection…', async () => {
        const info = await testConnection({ ...repo, token });
        await setSetting('gh.repo', repo);
        await setSetting('gh.token', token);
        toast(`Connected to ${info.fullName}${info.private ? ' (private ✓)' : ' (warning: repo is public!)'}`, { ms: 4000 });
        if (!this.d.data() || !(await db.dataCache.get('markers'))) {
          const r = await checkForUpdates({ ...repo, token });
          this.d.onDataChanged(r);
        }
      });
    } else if (a === 'check') {
      const c = await repoConfig();
      if (!c) return;
      await this.run('Checking for updates…', async () => {
        const r = await checkForUpdates(c);
        toast(describeUpdate(r));
        if (r.status !== 'unchanged') this.d.onDataChanged(r);
      });
    } else if (a === 'forget-token') {
      const ok = await dialog({ title: 'Remove token?', message: 'The map data already downloaded stays on this device. You can paste the token again later.', confirm: 'Remove', danger: true });
      if (ok) { await setSetting('gh.token', ''); await this.render(); toast('Token removed'); }
    } else if (a === 'export') {
      await this.run('Preparing backup…', async () => {
        const b = await exportBackup();
        const stamp = new Date().toISOString().slice(0, 10);
        try { await saveJsonFile(`leonida-backup-${stamp}.json`, b); } catch (err) { if ((err as Error).name === 'AbortError') return; throw err; }
        await markBackedUp();
        toast('Backup saved');
      });
    } else if (forget) {
      const ok = await dialog({ title: 'Forget this marker?', message: 'Its found state will be deleted. There is no undo.', confirm: 'Forget', danger: true });
      if (ok && this.d.progress) { await this.d.progress.setFound(forget, false); await this.render(); }
    }
  }

  private async onChange(e: Event) {
    const t = e.target as HTMLInputElement;
    if (t.classList.contains('coord')) { this.d.coordPicker.set(t.checked); return; }
    if (t.classList.contains('awake')) { this.d.prefs?.set('keepAwake', t.checked); return; }
    if (t.classList.contains('dl-zoom')) return;
    const files = t.files;
    if (!files?.length) return;
    if (t.classList.contains('data-file')) {
      await this.run('Importing map data…', async () => {
        const r = await importDataFiles(files);
        toast(`${describeUpdate(r)}${r.skipped ? ` (${r.skipped} invalid skipped)` : ''}`, { ms: 4000 });
        this.d.onDataChanged(r);
      });
    } else if (t.classList.contains('backup-file')) {
      await this.run('Reading backup…', async () => {
        let raw: unknown;
        try { raw = JSON.parse(await files[0].text()); } catch { throw new Error('That file isn\'t valid JSON'); }
        const b = parseBackup(raw);
        const ok = await dialog({ title: 'Import backup?', message: `From ${day(b.exportedAt)}: ${b.profiles.length} profile(s), ${b.progress.length} found, ${b.notes.length} notes, ${b.favourites.length} favourites, ${b.personal.length} personal markers. It's merged into this device: nothing here is deleted, newer entries win.`, confirm: 'Import' });
        if (!ok) return;
        const r = await importBackup(b);
        toast(`Imported: ${r.found} found, ${r.notes} notes, ${r.favourites} favourites, ${r.personal} markers${r.profiles ? `, ${r.profiles} profiles` : ''}`, { ms: 5000 });
        this.d.onBackupImported();
      });
    }
    t.value = '';
  }
}
