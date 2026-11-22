import 'leaflet/dist/leaflet.css';
import './style.css';
import './ui.css';
import './card.css';
import L from 'leaflet';
import { createMap, readSavedView, type TileRanges } from './map/map';
import { addLabels } from './map/labels';
import { MarkerLayer } from './map/markers';
import { toLatLng, toGame } from './map/crs';
import { loadDataset } from './data/load';
import type { Category, Label, Marker } from './data/types';
import { requestPersistence } from './db';
import { FilterStore, toggleOnly, setCategory, isVisible } from './state/filters';
import { ProgressStore, countByCategory, countByGroup } from './state/progress';
import { buildIndex, type SearchIndex } from './search/search';
import { FilterPanel } from './ui/filters';
import { SearchView } from './ui/search';
import { createControls } from './ui/controls';
import { MarkerCard } from './ui/card';
import { Menu } from './ui/menu';
import { toast } from './ui/toast';
import { appUrl, shareLink } from './ui/share';
import { parseLink, syncUrl, formatAt } from './deeplink';
import { glyphSvg } from './icons/pin';

const START = { id: 'safehouse-001', z: 2 };
const PLACE_ZOOM: Record<Label['type'], number> = { county: 1, region: 2, city: 3, town: 4, district: 5 };

/** Natural order of GTABase ids within a category ("bank-2" < "bank-10"). */
const byId = (a: Marker, b: Marker) => a.id.localeCompare(b.id, 'en', { numeric: true });
const cardInset = () => Math.round(window.innerHeight * 0.52);

async function boot() {
  requestPersistence();
  const el = document.getElementById('map')!;
  const ranges: TileRanges = await (await fetch(`${import.meta.env.BASE_URL}tiles/ranges.json`)).json();
  const map = createMap(el, ranges);
  const data = await loadDataset();
  const link = parseLink();

  const saved = readSavedView();
  const start = data?.markers.find((m) => m.id === START.id);
  if (link.at) map.setView(toLatLng(link.at.x, link.at.y), link.at.z);
  else if (saved) map.setView(toLatLng(saved.x, saved.y), saved.z);
  else if (start) map.setView(toLatLng(start.x, start.y), START.z);
  else map.setView(toLatLng(-3000, 0), 0);

  enableSpotLinks(map);
  if (link.at) showSharedSpot(map, link.at.x, link.at.y);

  if (!data) {
    const empty = new Menu({ progress: await initProgress(), groups: [], categories: [], markerById: () => undefined, markersOf: () => [], counts: () => ({ perCat: new Map(), perGroup: new Map() }), onOpenMarker: () => {} });
    createControls({ map, onSearch: noData, onFilters: noData, onMenu: () => empty.open() });
    document.getElementById('status')!.textContent = 'No map data loaded yet. Add your data source in Settings (coming in Phase 5).';
    return;
  }

  addLabels(map, data.labels);
  const progress = await initProgress();
  const filters = await FilterStore.load(data.categories);
  const catById = new Map(data.categories.map((c) => [c.id, c]));
  const markerById = new Map(data.markers.map((m) => [m.id, m]));
  const sortedByCat = new Map<string, Marker[]>();
  for (const m of data.markers) sortedByCat.set(m.category, [...(sortedByCat.get(m.category) ?? []), m]);
  for (const list of sortedByCat.values()) list.sort(byId);
  const siblings = (m: Marker) => sortedByCat.get(m.category) ?? [m];

  const layer = new MarkerLayer(map, data.markers, data.categories, data.groups, {
    isFound: progress.isFound,
    isNew: () => false, // Phase 5: "NEW" = added since my last sync (needs the sync baseline)
    onSelect: (m) => openMarker(m, { fly: false }),
  });

  // counts are cached and recomputed only when progress changes
  let counts = computeCounts();
  function computeCounts() {
    const perCat = countByCategory(data!.markers, progress.found);
    return { perCat, perGroup: countByGroup(data!.categories, perCat) };
  }

  let applyTimer = 0;
  const applyFilters = (immediate = false) => {
    clearTimeout(applyTimer);
    const run = () => layer.apply(filters.visible(), filters.state.hideFound);
    if (immediate) run(); else applyTimer = window.setTimeout(run, 120);
  };

  const panel = new FilterPanel({
    groups: data.groups,
    categories: data.categories,
    store: filters,
    counts: () => counts,
    onNextUnfound: (id) => nextUnfound(id),
  });
  filters.on((s) => {
    applyFilters();
    const only = s.only ? catById.get(s.only) : null;
    syncUrl({ feature: only ? (only.slug ?? only.id) : null });
  });
  progress.on((id) => {
    counts = computeCounts();
    panel.sync();
    if (id) layer.refresh(id); else layer.refreshAll();
  });

  // ---- marker card ----
  const card = new MarkerCard({
    progress,
    category: (id) => catById.get(id),
    siblings,
    onNavigate: (m) => openMarker(m),
    onZoom: (m) => layer.focus(m, Math.min(map.getMaxZoom(), Math.max(6, map.getZoom() + 1)), cardInset()),
    onClose: () => { layer.select(null); syncUrl({ m: null }); },
  });

  /** Open a marker's card; `fly` moves the map to it (search, links, prev/next), a tap on the pin doesn't zoom. */
  function openMarker(m: Marker, o: { fly?: boolean } = {}) {
    if (!isVisible(filters.state, m.category)) filters.update((s) => setCategory(s, m.category, true));
    applyFilters(true);
    if (panel.sheet.snap !== 'closed' && !panel.sheet.wide) panel.sheet.close();
    card.open(m);
    layer.select(m.id);
    layer.focus(m, o.fly === false ? null : 5, cardInset());
    syncUrl({ m: m.id, at: null });
  }

  // ---- jump to next unfound marker in a category (cycles; opens its card) ----
  const cursor = new Map<string, string>();
  function nextUnfound(catId: string) {
    const list = siblings({ category: catId } as Marker);
    const unfound = list.filter((m) => !progress.isFound(m.id));
    if (!unfound.length) { toast(`All ${catById.get(catId)?.name ?? ''} found`); return; }
    const after = cursor.get(catId) ?? (card.marker?.category === catId ? card.marker.id : undefined);
    const i = after ? list.findIndex((m) => m.id === after) : -1;
    const next = list.slice(i + 1).find((m) => !progress.isFound(m.id)) ?? unfound[0];
    cursor.set(catId, next.id);
    openMarker(next);
  }

  // ---- search ----
  let index: SearchIndex | null = null;
  const searchView = new SearchView({
    index: () => (index ??= buildIndex(data.markers, data.categories, data.labels)),
    onMarker: (m) => openMarker(m),
    onCategory: (c: Category) => {
      if (filters.state.only !== c.id) filters.update((s) => toggleOnly(s, c.id, filters.allIds));
      toast(`Showing only ${c.name}`);
    },
    onPlace: (l: Label) => map.flyTo(toLatLng(l.x, l.y), Math.max(PLACE_ZOOM[l.type], 1), { duration: 0.8 }),
  });

  // ---- menu: stats, profiles, reset, about ----
  const menu = new Menu({
    progress,
    groups: data.groups,
    categories: data.categories,
    markerById: (id) => markerById.get(id),
    markersOf: (id) => sortedByCat.get(id) ?? [],
    counts: () => counts,
    onOpenMarker: (m) => openMarker(m),
  });

  createControls({
    map,
    onSearch: () => searchView.open(),
    onFilters: () => panel.sheet.toggle('half'),
    onMenu: () => menu.open(),
  });

  // ---- deep links ----
  if (link.feature) {
    const c = data.categories.find((x) => x.id === link.feature || x.slug === link.feature);
    if (c) {
      filters.update((s) => toggleOnly({ ...s, only: null }, c.id, filters.allIds));
      panel.sheet.open('peek');
    }
  }
  applyFilters(true);
  if (link.m) {
    const m = markerById.get(link.m);
    if (m) openMarker(m);
    else { toast("That marker isn't in your data (it may have been removed)"); syncUrl({ m: null }); }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea,select')) { e.preventDefault(); searchView.open(); }
    if (e.key === 'Escape' && !e.defaultPrevented && card.sheet.snap !== 'closed' && !(e.target as HTMLElement).closest('.modal-wrap,.search,.viewer')) card.close();
  });

  if (import.meta.env.DEV) Object.assign(window, { __leonida: { map, data, layer, toLatLng, filters, progress, card } });
}

async function initProgress() {
  const p = new ProgressStore();
  await p.init();
  return p;
}

/** Long-press (or right-click) the map → "Copy link to this spot". */
function enableSpotLinks(map: L.Map) {
  map.on('contextmenu', (e: L.LeafletMouseEvent) => {
    const g = toGame(e.latlng);
    const url = appUrl({ at: formatAt(g.x, g.y, map.getZoom()) });
    const box = document.createElement('div');
    box.className = 'spot-pop';
    box.innerHTML = `<div class="spot-xy">x ${Math.round(g.x)}, y ${Math.round(g.y)}</div><button class="pill">${glyphSvg('link', 18)} Copy link to this spot</button>`;
    box.querySelector('button')!.addEventListener('click', () => { void shareLink(url, 'Shared spot', true); map.closePopup(); });
    L.popup({ closeButton: false, className: 'spot-popup', offset: [0, -4] }).setLatLng(e.latlng).setContent(box).openOn(map);
  });
}

function showSharedSpot(map: L.Map, x: number, y: number) {
  L.marker(toLatLng(x, y), {
    icon: L.divIcon({ className: 'shared-spot', html: `<span>${glyphSvg('location_on', 36)}</span>`, iconSize: [36, 36], iconAnchor: [18, 34] }),
    title: 'Shared spot', zIndexOffset: 2000,
  }).addTo(map).bindTooltip('Shared spot', { permanent: true, direction: 'top', offset: [0, -34], className: 'shared-tip' });
}

function noData() { toast('Load map data first (Settings → Data source, Phase 5)'); }

boot().catch((e) => {
  console.error(e);
  document.getElementById('status')!.textContent = `Couldn't start: ${e instanceof Error ? e.message : e}`;
});
