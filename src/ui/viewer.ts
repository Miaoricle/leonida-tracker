import { trapFocus } from './focus';
import { glyphSvg } from '../icons/pin';

/** Full-screen image viewer with pinch-zoom (native) and Escape / tap-to-close. */
export function openViewer(src: string, alt: string): void {
  const prev = document.activeElement as HTMLElement | null;
  const el = document.createElement('div');
  el.className = 'viewer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', alt);
  el.innerHTML = `<button class="icon-btn viewer-close" aria-label="Close image">${glyphSvg('close', 26)}</button><div class="viewer-scroll"><img alt=""></div>`;
  const img = el.querySelector('img')!;
  img.alt = alt;
  img.src = src;
  img.onerror = () => close();
  document.body.appendChild(el);
  const release = trapFocus(el);
  const close = () => { release(); el.remove(); prev?.focus?.({ preventScroll: true }); };
  el.querySelector('.viewer-close')!.addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el || (e.target as HTMLElement).classList.contains('viewer-scroll')) close(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  el.querySelector<HTMLElement>('.viewer-close')!.focus();
}
