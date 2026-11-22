import 'leaflet/dist/leaflet.css';
import './style.css';
import { createMap, readSavedView, type TileRanges } from './map/map';
import { addLabels } from './map/labels';
import { MarkerLayer } from './map/markers';
import { toLatLng } from './map/crs';
import { loadDataset } from './data/load';

const START = { id: 'safehouse-001', z: 2 };

async function boot() {
  const el = document.getElementById('map')!;
  const ranges: TileRanges = await (await fetch(`${import.meta.env.BASE_URL}tiles/ranges.json`)).json();
  const map = createMap(el, ranges);
  const data = await loadDataset();

  const saved = readSavedView();
  const start = data?.markers.find((m) => m.id === START.id);
  if (saved) map.setView(toLatLng(saved.x, saved.y), saved.z);
  else if (start) map.setView(toLatLng(start.x, start.y), START.z);
  else map.setView(toLatLng(-3000, 0), 0);

  if (!data) {
    document.getElementById('status')!.textContent = 'No map data loaded yet. Add your data source in Settings (coming in Phase 5).';
    return;
  }
  addLabels(map, data.labels);
  const layer = new MarkerLayer(map, data.markers, data.categories, data.groups, {
    onSelect: (m) => console.info('[marker]', m.id, m.name),
  });
  // Phase 2: show every non-empty category except the count-only ones GTABase hides by default
  layer.setVisible(data.categories.filter((c) => c.count > 0 && !c.hidden_default).map((c) => c.id));

  // dev helper for the alignment check
  if (import.meta.env.DEV) Object.assign(window, { __leonida: { map, data, layer, toLatLng } });
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('status')!.textContent = `Couldn't start: ${e instanceof Error ? e.message : e}`;
});
