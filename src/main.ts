import 'leaflet/dist/leaflet.css';
import './style.css';
import './ui.css';
import './card.css';
import './settings.css';
import './vehicles.css';
import L from 'leaflet';
import { createMap, readSavedView, type TileRanges } from './map/map';
import { addLabels } from './map/labels';
import { MarkerLayer } from './map/markers';
import { PersonalLayer } from './map/personal-layer';
import { toLatLng, toGame } from './map/crs';
import { loadDataset, loadIcons } from './data/load';
import { autoCheckDue, checkForUpdates, describeUpdate, repoConfig, type UpdateResult } from './data/store';
import type { Category, Dataset, Label, Marker } from './data/types';
import { getSetting, requestPersistence, type PersonalMarker } from './db';
import { FilterStore, toggleOnly, setCategory, isVisible } from './state/filters';
import { ProgressStore, countByCategory, countByGroup } from './state/progress';
import { PersonalStore, newPersonalId } from './state/personal';
import { buildIndex, type SearchIndex } from './search/search';
import { backupReminderDue } from './backup';
import { FilterPanel } from './ui/filters';
import { SearchView } from './ui/search';
import { createControls } from './ui/controls';
import { MarkerCard } from './ui/card';
import { Menu } from './ui/menu';
import { SettingsView } from './ui/settings';
import { MyMapView } from './ui/mymap';
import { personalForm } from './ui/personal-form';
import { dialog } from './ui/dialog';
import { toast } from './ui/toast';
import { appUrl, copyText, shareLink } from './ui/share';
import { parseLink, syncUrl, formatAt } from './deeplink';
import { glyphSvg, clearPinCache, setBlipIcons } from './icons/pin';
import { VehiclesView } from './ui/vehicles';
import { loadVehicles, matchVehicleMarkers } from './data/vehicles';
import { initPwa, initOfflineChip } from './pwa';
import { OfflineDownloader } from './offline';
import { PrefStore, PIN_PX, applyTheme } from './state/prefs';
import { setKeepAwake } from './wakelock';

const START = { id: 'safehouse-001', z: 2 };
const PLACE_ZOOM: Record<Label['type'], number> = { county: 1, region: 2, city: 3, town: 4, district: 5 };

/** Natural order of GTABase ids within a category ("bank-2" < "bank-10"). */
const byId = (a: Marker, b: Marker) => a.id.localeCompare(b.id, 'en', { numeric: true });
const cardInset = () => Math.round(window.innerHeight * 0.52);

/** After new map data is stored, the simplest correct refresh is a reload (keeps the URL, e.g. ?m=). */
function onDataChanged(r: UpdateResult) {
  if (r.status === 'unchanged') return;
  toast(`${describeUpdate(r)}. Reloading…`);
  setTimeout(() => location.reload(), 900);
}

async function boot() {
  requestPersistence();
  initPwa();
  initOfflineChip();
  const prefs = await PrefStore.load();
  applyTheme(prefs.value.theme);
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyTheme(prefs.value.theme));
  if (prefs.value.keepAwake) void setKeepAwake(true);
  prefs.on((p, k) => { if (k === 'theme') applyTheme(p.theme); if (k === 'keepAwake') void setKeepAwake(p.keepAwake); if (k === 'vividMap') el.classList.toggle('vivid', p.vividMap); });
  const downloader = new OfflineDownloader();
  // filled in once the map data is loaded
  const hooks: { hideFound?: { get: () => boolean; set: (on: boolean) => void } } = {};
  const el = document.getElementById('map')!;
  const ranges: TileRanges = await (await fetch(`${import.meta.env.BASE_URL}tiles/ranges.json`)).json();
  const map = createMap(el, ranges);
  el.classList.toggle('vivid', prefs.value.vividMap);
  const [data, progress, icons] = await Promise.all([loadDataset(), initProgress(), loadIcons().catch(() => undefined)]);
  setBlipIcons(icons);
  const link = parseLink();

  const saved = readSavedView();
  const start = data?.markers.find((m) => m.id === START.id);
  if (link.at) map.setView(toLatLng(link.at.x, link.at.y), link.at.z);
  else if (saved) map.setView(toLatLng(saved.x, saved.y), saved.z);
  else if (start) map.setView(toLatLng(start.x, start.y), START.z);
  else map.setView(toLatLng(-3000, 0), 0);
  if (link.at) showSharedSpot(map, link.at.x, link.at.y);

  // ---- settings (also the first-run screen) ----
  let coordPicker = false;
  const settings = new SettingsView({
    data: () => data,
    progress,
    onDataChanged,
    onBackupImported: () => setTimeout(() => location.reload(), 1200),
    coordPicker: { get: () => coordPicker, set: (on) => { coordPicker = on; el.classList.toggle('picking', on); toast(on ? 'Coordinate picker on: tap the map' : 'Coordinate picker off'); } },
    prefs,
    hideFound: { get: () => hooks.hideFound?.get() ?? false, set: (on) => hooks.hideFound?.set(on) },
    downloader,
  });
  map.on('click', (e: L.LeafletMouseEvent) => { if (coordPicker) showCoords(map, e.latlng); });

  if (!data) {
    const empty = new Menu({ progress, groups: [], categories: [], markerById: () => undefined, markersOf: () => [], counts: () => ({ perCat: new Map(), perGroup: new Map() }), onOpenMarker: () => {}, onSettings: () => void settings.open('data') });
    createControls({ map, onSearch: noData, onFilters: noData, onMenu: () => empty.open() });
    enableLongPress(map, null);
    document.getElementById('status')!.innerHTML = 'Welcome! Add your data source to load the map. <button class="link-btn" id="go-setup">Set up</button>';
    document.getElementById('go-setup')!.addEventListener('click', () => void settings.open('data'));
    void settings.open('data');
    return;
  }
  await runApp(map, data, progress, settings, link, prefs, hooks);
}

async function runApp(map: L.Map, data: Dataset, progress: ProgressStore, settings: SettingsView, link: ReturnType<typeof parseLink>,
  prefs: PrefStore, hooks: { hideFound?: { get: () => boolean; set: (on: boolean) => void } }) {
  const pinSize = () => PIN_PX[prefs.value.markerSize];
  addLabels(map, data.labels);
  const filters = await FilterStore.load(data.categories);
  const personal = new PersonalStore();
  await personal.load(progress.profile.id);
  const newIds = new Set(await getSetting<string[]>('data.newIds', []));
  const catById = new Map(data.categories.map((c) => [c.id, c]));
  const markerById = new Map(data.markers.map((m) => [m.id, m]));
  const sortedByCat = new Map<string, Marker[]>();
  for (const m of data.markers) sortedByCat.set(m.category, [...(sortedByCat.get(m.category) ?? []), m]);
  for (const list of sortedByCat.values()) list.sort(byId);
  const anyMarker = (id: string): Marker | undefined => markerById.get(id) ?? personal.get(id);
  const siblings = (m: Marker) => (m.source === 'user' ? [...personal.list].sort((a, b) => a.name.localeCompare(b.name)) : sortedByCat.get(m.category) ?? [m]);

  const layer = new MarkerLayer(map, data.markers, data.categories, data.groups, {
    isFound: progress.isFound,
    isNew: (m) => newIds.has(m.id),
    onSelect: (m) => openMarker(m, { fly: false }),
    size: pinSize,
  });
  const personalLayer = new PersonalLayer(map, personal, (id) => catById.get(id)?.color, {
    onSelect: (m) => openMarker(m, { fly: false }),
    isFound: progress.isFound,
    size: pinSize,
  });
  personalLayer.render();
  prefs.on((_p, k) => { if (k === 'markerSize') { clearPinCache(); layer.refreshAll(); personalLayer.render(); } });
  hooks.hideFound = { get: () => filters.state.hideFound, set: (on) => filters.update((s) => ({ ...s, hideFound: on })) };

  // counts are cached and recomputed only when progress changes
  let counts = computeCounts();
  function computeCounts() {
    const perCat = countByCategory(data.markers, progress.found);
    return { perCat, perGroup: countByGroup(data.categories, perCat) };
  }

  let applyTimer = 0;
  const applyFilters = (immediate = false) => {
    clearTimeout(applyTimer);
    const run = () => layer.apply(filters.visible(), filters.state.hideFound);
    if (immediate) run(); else applyTimer = window.setTimeout(run, 120);
  };

  const panel = new FilterPanel({ groups: data.groups, categories: data.categories, store: filters, counts: () => counts, onNextUnfound: (id) => nextUnfound(id) });
  filters.on((s) => {
    applyFilters();
    const only = s.only ? catById.get(s.only) : null;
    syncUrl({ feature: only ? (only.slug ?? only.id) : null });
  });
  let lastProfile = progress.profile.id;
  progress.on((id) => {
    counts = computeCounts();
    panel.sync();
    if (id) layer.refresh(id); else layer.refreshAll();
    personalLayer.refresh();
    if (progress.profile.id !== lastProfile) { lastProfile = progress.profile.id; card.close(); void personal.load(lastProfile); }
  });

  // ---- marker card ----
  // vehicles <-> map markers (filled once the vehicle list is read from the cache)
  let vehicleLocs = new Map<string, string[]>();
  let vehicleOfMarker = new Map<string, string>();
  const card = new MarkerCard({
    progress,
    category: (id) => catById.get(id),
    siblings,
    onNavigate: (m) => openMarker(m),
    onZoom: (m) => focus(m, Math.min(map.getMaxZoom(), Math.max(6, map.getZoom() + 1))),
    onClose: () => { layer.select(null); personalLayer.select(null); syncUrl({ m: null }); },
    photoUrl: (m) => personal.photoUrl(m as PersonalMarker),
    onEdit: (m) => void editPersonal(m as PersonalMarker),
    onDelete: (m) => void deletePersonal(m as PersonalMarker),
    vehicleFor: (m) => vehicleOfMarker.get(m.id),
    onVehicle: (slug) => void vehiclesView.open(slug),
  });

  function focus(m: Marker, zoom: number | null) {
    if (m.source === 'user') {
      const ll = toLatLng(m.x, m.y);
      const z = zoom ?? map.getZoom();
      map.flyTo(map.unproject(map.project(ll, z).add([0, cardInset() / 2]), z), z, { duration: 0.6 });
    } else layer.focus(m, zoom, cardInset());
  }

  /** Open a marker's card; `fly` moves the map to it (search, links, prev/next), a tap on the pin doesn't zoom. */
  function openMarker(m: Marker, o: { fly?: boolean } = {}) {
    if (m.source !== 'user') {
      if (!isVisible(filters.state, m.category)) filters.update((s) => setCategory(s, m.category, true));
      applyFilters(true);
    }
    if (panel.sheet.snap !== 'closed' && !panel.sheet.wide) panel.sheet.close();
    card.open(m);
    if (m.source === 'user') { personalLayer.select(m.id); layer.select(null); } else { layer.select(m.id); personalLayer.select(null); }
    focus(m, o.fly === false ? null : 5);
    syncUrl({ m: m.source === 'user' ? null : m.id, at: null });
  }

  // ---- jump to next unfound marker in a category (cycles; opens its card) ----
  const cursor = new Map<string, string>();
  function nextUnfound(catId: string) {
    const list = sortedByCat.get(catId) ?? [];
    const unfound = list.filter((m) => !progress.isFound(m.id));
    if (!unfound.length) { toast(`All ${catById.get(catId)?.name ?? ''} found`); return; }
    const after = cursor.get(catId) ?? (card.marker?.category === catId ? card.marker.id : undefined);
    const i = after ? list.findIndex((m) => m.id === after) : -1;
    const next = list.slice(i + 1).find((m) => !progress.isFound(m.id)) ?? unfound[0];
    cursor.set(catId, next.id);
    openMarker(next);
  }

  // ---- personal markers ----
  const customNames = () => [...new Set(personal.list.map((m) => m.customCategory).filter(Boolean) as string[])];
  async function addPersonal(x: number, y: number) {
    const r = await personalForm({ title: 'Add personal marker', groups: data.groups, categories: data.categories, customNames: customNames() });
    if (!r) return;
    const m: PersonalMarker = {
      id: newPersonalId(), profileId: progress.profile.id, source: 'user', addedAt: new Date().toISOString(),
      name: r.name, category: r.category, customCategory: r.customCategory, x: Math.round(x), y: Math.round(y), ...(r.photo ? { photo: r.photo } : {}),
    };
    await personal.save(m);
    if (r.note.trim()) await progress.setNote(m.id, r.note);
    openMarker(m, { fly: false });
    toast('Marker added. Drag the pin to fine-tune it.');
  }
  async function editPersonal(m: PersonalMarker) {
    const cur = personal.get(m.id) ?? m;
    const r = await personalForm({ title: 'Edit marker', groups: data.groups, categories: data.categories, initial: cur, note: progress.note(m.id), photoUrl: personal.photoUrl(cur), customNames: customNames() });
    if (!r) return;
    const next: PersonalMarker = { ...cur, name: r.name, category: r.category, customCategory: r.customCategory };
    if (r.photo === null) delete next.photo; else if (r.photo) next.photo = r.photo;
    await personal.save(next);
    await progress.setNote(m.id, r.note);
    card.open(next);
  }
  async function deletePersonal(m: PersonalMarker) {
    const ok = await dialog({ title: `Delete "${m.name}"?`, message: 'This personal marker, its photo and note will be deleted. There is no undo.', confirm: 'Delete', danger: true });
    if (!ok) return;
    card.close();
    await personal.remove(m.id);
    await progress.setNote(m.id, '');
    if (progress.isFound(m.id)) await progress.setFound(m.id, false);
    toast('Marker deleted');
  }
  enableLongPress(map, (x, y) => void addPersonal(x, y));

  // ---- search (GTABase + personal markers) ----
  let index: SearchIndex | null = null;
  personal.on(() => { index = null; });
  const searchView = new SearchView({
    index: () => (index ??= buildIndex([...data.markers, ...personal.list], data.categories, data.labels)),
    onMarker: (m) => openMarker(m),
    onCategory: (c: Category) => {
      if (filters.state.only !== c.id) filters.update((s) => toggleOnly(s, c.id, filters.allIds));
      toast(`Showing only ${c.name}`);
    },
    onPlace: (l: Label) => map.flyTo(toLatLng(l.x, l.y), Math.max(PLACE_ZOOM[l.type], 1), { duration: 0.8 }),
  });

  // ---- vehicles database ----
  const loadVehiclesLinked = async () => {
    const vs = await loadVehicles();
    vehicleLocs = matchVehicleMarkers(vs, data.markers);
    const slug = new Map(vs.map((v) => [v.id, v.slug]));
    vehicleOfMarker = new Map([...vehicleLocs].flatMap(([vid, ids]) => ids.map((id) => [id, slug.get(vid)!] as [string, string])));
    return vs;
  };
  void loadVehiclesLinked().catch(() => {});
  const vehiclesView = new VehiclesView({
    vehicles: loadVehiclesLinked,
    locations: (v) => (vehicleLocs.get(v.id) ?? []).map((id) => markerById.get(id)).filter((m): m is Marker => !!m).map((m) => {
      const c = catById.get(m.category);
      return { id: m.id, name: m.name, category: m.category, catName: c?.name ?? '', color: c?.color ?? '#888', found: progress.isFound(m.id) };
    }),
    onOpenMarker: (id) => { const m = markerById.get(id); if (m) openMarker(m); return !!m; },
  });

  const mymap = new MyMapView({ progress, personal, category: (id) => catById.get(id), marker: anyMarker, onOpen: (m) => openMarker(m) });
  const menu = new Menu({
    progress, groups: data.groups, categories: data.categories,
    markerById: anyMarker, markersOf: (id) => sortedByCat.get(id) ?? [], counts: () => counts,
    onOpenMarker: (m) => openMarker(m), onMyMap: () => mymap.open(), onSettings: () => void settings.open(),
    onVehicles: () => void vehiclesView.open(),
  });

  createControls({ map, onSearch: () => searchView.open(), onFilters: () => panel.sheet.toggle('half'), onMenu: () => menu.open(), onVehicles: () => void vehiclesView.open() });

  // ---- deep links ----
  if (link.feature) {
    const c = data.categories.find((x) => x.id === link.feature || x.slug === link.feature);
    if (c) { filters.update((s) => toggleOnly({ ...s, only: null }, c.id, filters.allIds)); panel.sheet.open('peek'); }
  }
  applyFilters(true);
  if (link.v) void vehiclesView.open(link.v);
  if (link.m) {
    const m = markerById.get(link.m);
    if (m) openMarker(m);
    else { toast("That marker isn't in your data (it may have been removed)"); syncUrl({ m: null }); }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea,select')) { e.preventDefault(); searchView.open(); }
    if (e.key === 'Escape' && !e.defaultPrevented && card.sheet.snap !== 'closed' && !(e.target as HTMLElement).closest('.modal-wrap,.search,.viewer,.vehicles')) card.close();
  });

  // ---- background: daily update check, backup reminder ----
  setTimeout(async () => {
    const c = await repoConfig();
    if (c && (await autoCheckDue())) {
      try {
        const r = await checkForUpdates(c);
        if (r.status === 'updated') toast(`Map data updated: +${r.added}, −${r.removed}`, { ms: 10000, action: { label: 'Reload', run: () => location.reload() } });
      } catch (e) { console.warn('update check failed', e); }
    }
    if (await backupReminderDue(progress.found.size + personal.list.length > 0)) {
      toast('No backup in 7 days', { ms: 10000, action: { label: 'Back up', run: () => void settings.open('backup') } });
    }
  }, 2500);

  if (import.meta.env.DEV) Object.assign(window, { __leonida: { map, data, layer, toLatLng, filters, progress, card, personal } });
}

async function initProgress() {
  const p = new ProgressStore();
  await p.init();
  return p;
}

/** Long-press (or right-click) the map → Add personal marker · Copy link to this spot. */
function enableLongPress(map: L.Map, onAdd: ((x: number, y: number) => void) | null) {
  map.on('contextmenu', (e: L.LeafletMouseEvent) => {
    const g = toGame(e.latlng);
    const url = appUrl({ at: formatAt(g.x, g.y, map.getZoom()) });
    const box = document.createElement('div');
    box.className = 'spot-pop';
    box.innerHTML = `<div class="spot-xy">x ${Math.round(g.x)}, y ${Math.round(g.y)}</div>
      ${onAdd ? `<button class="pill" data-a="add">${glyphSvg('add_location', 18)} Add personal marker</button>` : ''}
      <button class="pill" data-a="link">${glyphSvg('link', 18)} Copy link to this spot</button>`;
    box.addEventListener('click', (ev) => {
      const a = (ev.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'link') void shareLink(url, 'Shared spot', true);
      if (a === 'add') onAdd?.(g.x, g.y);
      if (a) map.closePopup();
    });
    L.popup({ closeButton: false, className: 'spot-popup', offset: [0, -4] }).setLatLng(e.latlng).setContent(box).openOn(map);
  });
}

/** Coordinate picker: tap → game x, y with a Copy button. */
function showCoords(map: L.Map, ll: L.LatLng) {
  const g = toGame(ll);
  const text = `${Math.round(g.x)}, ${Math.round(g.y)}`;
  const box = document.createElement('div');
  box.className = 'spot-pop';
  box.innerHTML = `<div class="spot-xy big">${text}</div><button class="pill">Copy</button>`;
  box.querySelector('button')!.addEventListener('click', () => { void copyText(text, 'Copied').then(() => map.closePopup()); });
  L.popup({ closeButton: false, className: 'spot-popup', offset: [0, -4] }).setLatLng(ll).setContent(box).openOn(map);
}

function showSharedSpot(map: L.Map, x: number, y: number) {
  L.marker(toLatLng(x, y), {
    icon: L.divIcon({ className: 'shared-spot', html: `<span>${glyphSvg('location_on', 36)}</span>`, iconSize: [36, 36], iconAnchor: [18, 34] }),
    title: 'Shared spot', zIndexOffset: 2000,
  }).addTo(map).bindTooltip('Shared spot', { permanent: true, direction: 'top', offset: [0, -34], className: 'shared-tip' });
}

function noData() { toast('Load map data first: Menu → Settings → Data source'); }

boot().catch((e) => {
  console.error(e);
  document.getElementById('status')!.textContent = `Couldn't start: ${e instanceof Error ? e.message : e}`;
});
