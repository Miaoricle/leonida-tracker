let host: HTMLElement | null = null;

/** Short, non-blocking message at the bottom of the screen. */
export function toast(text: string, opts: { ms?: number; action?: { label: string; run: () => void } } = {}): void {
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  if (opts.action) {
    const b = document.createElement('button');
    b.textContent = opts.action.label;
    b.addEventListener('click', () => { opts.action!.run(); t.remove(); });
    t.appendChild(b);
  }
  host.appendChild(t);
  setTimeout(() => t.remove(), opts.ms ?? 2600);
}
