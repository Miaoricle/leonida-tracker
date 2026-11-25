// Bottom navigation bar: Map · Vehicles · Weapons · Missions · More. Full-screen tabs open above it; the active
// tab follows whichever tab view is visible (watched via its `hidden` attribute, so every way of opening or
// closing a tab — deep links, the map card's Vehicle button, Escape — keeps the bar in sync).
import { glyphSvg } from '../icons/pin';

export interface NavTab { id: string; label: string; icon: string; view?: { el: HTMLElement; open: () => void; close: () => void } }

export function createNavBar(tabs: NavTab[], onMore: () => void): HTMLElement {
  const el = document.createElement('nav');
  el.className = 'navbar';
  el.setAttribute('aria-label', 'Sections');
  el.innerHTML = [...tabs, { id: 'more', label: 'More', icon: 'menu' }]
    .map((t) => `<button data-tab="${t.id}" aria-label="${t.label}"><span class="nav-ico">${glyphSvg(t.icon, 24)}</span><span class="nav-lbl">${t.label}</span></button>`).join('');
  const views = tabs.filter((t) => t.view);
  const closeAll = (except?: NavTab) => { for (const t of views) if (t !== except && !t.view!.el.hidden) t.view!.close(); };
  const sync = () => {
    const open = views.find((t) => !t.view!.el.hidden);
    const active = open?.id ?? 'map';
    el.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => {
      const on = b.dataset.tab === active;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    document.documentElement.dataset.tab = active;
  };
  el.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab;
    if (!id) return;
    const t = tabs.find((x) => x.id === id);
    const menuOpen = !!document.querySelector('#menu:not([data-snap="closed"])');
    document.querySelectorAll<HTMLElement>('.sheet:not([data-snap="closed"]) .sheet-close').forEach((b) => b.click());
    if (id === 'more') { closeAll(); if (!menuOpen) onMore(); return; }
    if (!t?.view) { closeAll(); return; } // Map
    if (!t.view.el.hidden) { t.view.el.scrollTo({ top: 0, behavior: 'smooth' }); return; } // tap again: back to top
    closeAll(t);
    t.view.open();
  });
  const mo = new MutationObserver(sync);
  for (const t of views) mo.observe(t.view!.el, { attributes: true, attributeFilter: ['hidden'] });
  document.body.appendChild(el);
  document.documentElement.classList.add('has-nav');
  sync();
  return el;
}
