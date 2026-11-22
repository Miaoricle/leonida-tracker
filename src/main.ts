import 'leaflet/dist/leaflet.css';
import './style.css';
import './ui.css';
import { createMap, readSavedView, type TileRanges } from './map/map';
import { addLabels } from './map/labels';
import { MarkerLayer } from './map/markers';
import { toLatLng } from './map/crs';
import { loadDataset } from './data/load';
import type { Category, Label, Marker } from './data/types';
import { requestPersistence } from './db';
import { FilterStore, toggleOnly, setCategory, isVisible } from './state/filters';
import { ProgressStore, countByCategory, countByGroup } from './state/progress';
import { buildIndex, type SearchIndex } from './search/search';
import { FilterPanel } from './ui/filters';
import { SearchView } from './ui/search';
import { createControls } from './ui/controls';
import { Sheet } from './ui/sheet';
import { toast } from './ui/toast';

const START = { id: 'safehouse-001', z: 2 };
const PLACE_ZOOM: Record<Label['type'], number> = { county: 1, region: 2, city: 3, town: 4, district: 5 };

/** Natural order of GTABase ids within a category ("bank-2" < "bank-10"). */
const byId = (a: Marker, b: Marker) => a.id.localeCompare(b.id, 'en', { numeric: true });

async function boot() {
  requestPersistence();
  const el = document.getElementById('map')!;
  const ranges: TileRanges = await (await fetch(`${import.meta.env.BASE_URL}tiles/ranges.json`)).json();
  const map = createMap(el, ranges);
  const data = await loadDataset();

  const saved = readSavedView();
  const start = data?.markers.find((m) => m.id === START.id);
  if (saved) map.setView(toLatLng(saved.x, saved.y), saved.z);
  else if (start) map.setView(toLatLng(start.x, start.y), START.z);
  else map.setView(toLatLng(-3000, 0), 0);

  const about = createAbout();
  if (!data) {
    createControls({ map, onSearch: noData, onFilters: noData, onAbout: () => about.open('full') });
    document.getElementById('status')!.textContent = 'No map data loaded yet. Add your data source in Settings (coming in Phase 5).';
    return;
  }

  addLabels(map, data.labels);
  const progress = new ProgressStore();
  await progress.init();
  const filters = await FilterStore.load(data.categories);
  const catById = new Map(data.categories.map((c) => [c.id, c]));

  const layer = new MarkerLayer(map, data.markers, data.categories, data.groups, {
    isFound: progress.isFound,
    isNew: () => false, // Phase 5: "NEW" = added since my last sync (needs the sync baseline)
    onSelect: (m) => console.info('[marker]', m.id, m.name), // Phase 4: marker card
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
  filters.on(() => applyFilters());
  progress.on((id) => {
    counts = computeCounts();
    panel.sync();
    if (id) layer.refresh(id); else layer.refreshAll();
  });

  // ---- jump to next unfound marker in a category (cycles; opens it) ----
  const cursor = new Map<string, string>();
  function nextUnfound(catId: string) {
    const list = layer.markersOf(catId).slice().sort(byId);
    const unfound = list.filter((m) => !progress.isFound(m.id));
    if (!unfound.length) { toast(`All ${catById.get(catId)?.name ?? ''} found`); return; }
    const after = cursor.get(catId);
    const i = after ? list.findIndex((m) => m.id === after) : -1;
    const next = list.slice(i + 1).find((m) => !progress.isFound(m.id)) ?? unfound[0];
    cursor.set(catId, next.id);
    if (!isVisible(filters.state, catId)) filters.update((s) => setCategory(s, catId, true));
    openMarker(next);
  }

  function openMarker(m: Marker) {
    if (!isVisible(filters.state, m.category)) filters.update((s) => setCategory(s, m.category, true));
    applyFilters(true);
    if (panel.sheet.snap === 'full' || panel.sheet.snap === 'half') panel.sheet.open('peek');
    layer.focus(m);
  }

  // ---- search ----
  let index: SearchIndex | null = null;
  const searchView = new SearchView({
    index: () => (index ??= buildIndex(data.markers, data.categories, data.labels)),
    onMarker: openMarker,
    onCategory: (c: Category) => {
      if (filters.state.only !== c.id) filters.update((s) => toggleOnly(s, c.id, filters.allIds));
      toast(`Showing only ${c.name}`);
    },
    onPlace: (l: Label) => map.flyTo(toLatLng(l.x, l.y), Math.max(PLACE_ZOOM[l.type], 1), { duration: 0.8 }),
  });

  createControls({
    map,
    onSearch: () => searchView.open(),
    onFilters: () => panel.sheet.toggle('half'),
    onAbout: () => about.open('full'),
  });

  // ---- deep link: ?feature=<category id or GTABase slug> ----
  const params = new URLSearchParams(location.search);
  const feature = params.get('feature');
  if (feature) {
    const c = data.categories.find((x) => x.id === feature || x.slug === feature);
    if (c) {
      filters.update((s) => ({ ...toggleOnly({ ...s, only: null }, c.id, filters.allIds) }));
      panel.sheet.open('peek');
    }
  }
  applyFilters(true);

  // keyboard: "/" opens search, Escape closes panels (sheets handle their own Escape when focused)
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea')) { e.preventDefault(); searchView.open(); }
  });

  if (import.meta.env.DEV) Object.assign(window, { __leonida: { map, data, layer, toLatLng, filters, progress } });
}

function noData() { toast('Load map data first (Settings → Data source, Phase 5)'); }

function createAbout(): Sheet {
  const s = new Sheet({ id: 'about', title: 'About' });
  s.body.innerHTML = `
    <div class="about">
      <p><b>Leonida Tracker</b>: a personal, ad-free GTA 6 map tracker.</p>
      <ul class="credits">
        <li>Locations &amp; screenshots: <a href="https://www.gtabase.com/gta-6/map/" target="_blank" rel="noopener">GTABase.com</a>, used with the owner's permission for personal use</li>
        <li>Map tiles: <a href="https://gtadb.org" target="_blank" rel="noopener">gtadb.org</a> and contributors (CC BY 4.0)</li>
        <li>Icons: Google Material Symbols (Apache 2.0)</li>
        <li>Fan project, not affiliated with Rockstar Games or Take-Two.</li>
      </ul>
    </div>`;
  return s;
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('status')!.textContent = `Couldn't start: ${e instanceof Error ? e.message : e}`;
});
