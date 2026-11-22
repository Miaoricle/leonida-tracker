import type L from 'leaflet';
import { glyphSvg } from '../icons/pin';

export interface ControlDeps { map: L.Map; onSearch: () => void; onFilters: () => void; onAbout: () => void }

/** Floating controls, bottom-right, in thumb reach: zoom ±, Search, Filters, Full screen, About. */
export function createControls(d: ControlDeps): HTMLElement {
  const el = document.createElement('nav');
  el.className = 'controls';
  el.setAttribute('aria-label', 'Map controls');
  const fsSupported = !!document.documentElement.requestFullscreen;
  el.innerHTML = `
    <button class="fab" data-a="search" aria-label="Search">${glyphSvg('search')}</button>
    <button class="fab" data-a="filters" aria-label="Filters">${glyphSvg('tune')}</button>
    ${fsSupported ? `<button class="fab" data-a="fs" aria-label="Full screen">${glyphSvg('fullscreen')}</button>` : ''}
    <button class="fab" data-a="about" aria-label="About">${glyphSvg('info')}</button>
    <div class="fab-zoom">
      <button class="fab" data-a="in" aria-label="Zoom in">${glyphSvg('add')}</button>
      <button class="fab" data-a="out" aria-label="Zoom out">${glyphSvg('remove')}</button>
    </div>`;
  el.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'in') d.map.zoomIn();
    else if (a === 'out') d.map.zoomOut();
    else if (a === 'search') d.onSearch();
    else if (a === 'filters') d.onFilters();
    else if (a === 'about') d.onAbout();
    else if (a === 'fs') {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen().catch(() => {});
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const b = el.querySelector('[data-a="fs"]');
    if (b) b.innerHTML = glyphSvg(document.fullscreenElement ? 'fullscreen_exit' : 'fullscreen');
  });
  document.body.appendChild(el);
  return el;
}
