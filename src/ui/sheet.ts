// Bottom sheet with snap points (peek / half / full). On wide screens (>= 900px) it's a left sidebar instead.
export type Snap = 'closed' | 'peek' | 'half' | 'full';

const WIDE = matchMedia('(min-width: 900px)');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let probe: HTMLElement | null = null;
/** env(safe-area-inset-top) in px (custom properties don't resolve env(), so measure a probe element). */
function safeAreaTop(): number {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top,0px)';
    document.body.appendChild(probe);
  }
  return probe.offsetHeight;
}

export interface SheetOptions { title: string; id: string; peekHeight?: number; onSnap?: (s: Snap) => void; sidebar?: boolean }

export class Sheet {
  /** Bottom-sheet positions, so the floating controls can sit above the tallest one. */
  static state = new Map<string, { snap: Snap; h: number }>();
  readonly el: HTMLElement;
  readonly header: HTMLElement;
  readonly body: HTMLElement;
  readonly titleEl: HTMLElement;
  snap: Snap = 'closed';
  private returnFocus: HTMLElement | null = null;

  constructor(private opts: SheetOptions) {
    this.el = document.createElement('section');
    this.el.className = `sheet${opts.sidebar ? ' sheet-sidebar' : ''}`;
    this.el.id = opts.id;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', opts.title);
    this.el.dataset.snap = 'closed';
    this.el.innerHTML = `
      <div class="sheet-grab" aria-hidden="true"><span></span></div>
      <header class="sheet-head"><h2 class="sheet-title"></h2><button class="icon-btn sheet-close" aria-label="Close">✕</button></header>
      <div class="sheet-body"></div>`;
    this.header = this.el.querySelector('.sheet-head')!;
    this.body = this.el.querySelector('.sheet-body')!;
    this.titleEl = this.el.querySelector('.sheet-title')!;
    this.titleEl.textContent = opts.title;
    this.el.querySelector('.sheet-close')!.addEventListener('click', () => this.close());
    this.el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.close(); } });
    document.body.appendChild(this.el);
    this.enableDrag();
  }

  get wide() { return !!this.opts.sidebar && WIDE.matches; }

  private heights(): Record<Snap, number> {
    const vh = window.innerHeight;
    const safeTop = safeAreaTop();
    return { closed: 0, peek: this.opts.peekHeight ?? 150, half: Math.round(vh * 0.52), full: vh - safeTop - 12 };
  }

  private apply(px?: number, animate = true) {
    const h = this.heights();
    const target = px ?? h[this.snap];
    this.el.style.transition = animate && !reduced() ? '' : 'none';
    this.el.style.setProperty('--sheet-h', `${h.full}px`);
    this.el.style.transform = this.wide ? '' : `translateY(${h.full - target}px)`;
    this.el.dataset.snap = this.snap;
    // lift the floating map controls above a bottom sheet so zoom stays reachable
    Sheet.state.set(this.el.id, this.wide ? { snap: 'closed', h: 0 } : { snap: this.snap, h: this.snap === 'full' ? 0 : target });
    const order: Snap[] = ['closed', 'peek', 'half', 'full'];
    const all = [...Sheet.state.values()];
    const top = all.reduce((a, b) => (order.indexOf(b.snap) > order.indexOf(a) ? b.snap : a), 'closed' as Snap);
    document.documentElement.dataset.sheet = top;
    document.documentElement.style.setProperty('--sheet-lift', `${Math.max(0, ...all.map((s) => s.h))}px`);
  }

  open(snap: Snap = 'half') {
    if (this.snap === 'closed') this.returnFocus = document.activeElement as HTMLElement | null;
    this.snap = snap;
    this.el.hidden = false;
    this.apply();
    this.opts.onSnap?.(snap);
    if (snap !== 'peek') (this.el.querySelector<HTMLElement>('.sheet-close'))?.focus({ preventScroll: true });
  }

  close() {
    if (this.snap === 'closed') return;
    this.snap = 'closed';
    this.apply();
    this.opts.onSnap?.('closed');
    this.returnFocus?.focus?.({ preventScroll: true });
  }

  toggle(snap: Snap = 'half') { if (this.snap === 'closed') this.open(snap); else this.close(); }

  private enableDrag() {
    const handles = [this.el.querySelector<HTMLElement>('.sheet-grab')!, this.header];
    let startY = 0, startH = 0, lastY = 0, lastT = 0, v = 0, dragging = false;
    const down = (e: PointerEvent) => {
      if (this.wide || (e.target as HTMLElement).closest('button')) return;
      dragging = true; startY = lastY = e.clientY; lastT = e.timeStamp; v = 0;
      startH = this.heights()[this.snap];
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dt = Math.max(1, e.timeStamp - lastT);
      v = (e.clientY - lastY) / dt; lastY = e.clientY; lastT = e.timeStamp;
      const h = Math.max(0, Math.min(this.heights().full, startH - (e.clientY - startY)));
      this.apply(h, false);
    };
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const hs = this.heights();
      const cur = startH - (e.clientY - startY);
      if (Math.abs(e.clientY - startY) < 6) { this.apply(); return; } // a tap, not a drag
      // fling: velocity decides direction; otherwise nearest snap
      const order: Snap[] = ['closed', 'peek', 'half', 'full'];
      let next: Snap;
      if (Math.abs(v) > 0.6) {
        const i = order.indexOf(this.snap);
        next = order[Math.max(0, Math.min(3, i + (v < 0 ? 1 : -1)))];
      } else {
        next = order.reduce((a, b) => (Math.abs(hs[b] - cur) < Math.abs(hs[a] - cur) ? b : a));
      }
      if (next === 'closed') this.close(); else this.open(next);
    };
    for (const h of handles) {
      h.addEventListener('pointerdown', down);
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up);
      h.addEventListener('pointercancel', up);
    }
    window.addEventListener('resize', () => this.apply(undefined, false));
    WIDE.addEventListener('change', () => this.apply(undefined, false));
    this.apply(undefined, false);
  }
}
