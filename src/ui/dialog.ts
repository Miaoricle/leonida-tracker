import { trapFocus } from './focus';

export interface DialogOptions {
  title: string;
  message?: string;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
  input?: { value?: string; placeholder?: string; label: string };
  select?: { label: string; options: { value: string; label: string }[] };
}

/** Accessible modal (focus trap, Escape cancels). Resolves the input/select value, true, or null when cancelled. */
export function dialog(o: DialogOptions): Promise<string | true | null> {
  return new Promise((resolve) => {
    const prev = document.activeElement as HTMLElement | null;
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    const id = `dlg-${Date.now()}`;
    wrap.innerHTML = `
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="${id}-t" ${o.message ? `aria-describedby="${id}-m"` : ''}>
        <h2 id="${id}-t"></h2>
        ${o.message ? `<p id="${id}-m" class="modal-msg"></p>` : ''}
        ${o.input ? `<label class="field"><span></span><input class="modal-input" maxlength="40"></label>` : ''}
        ${o.select ? `<label class="field"><span></span><select class="modal-select"></select></label>` : ''}
        <div class="modal-actions">
          <button class="pill" data-r="cancel"></button>
          <button class="pill ${o.danger ? 'danger' : 'primary'}" data-r="ok"></button>
        </div>
      </div>`;
    wrap.querySelector('h2')!.textContent = o.title;
    if (o.message) wrap.querySelector('.modal-msg')!.textContent = o.message;
    const input = wrap.querySelector<HTMLInputElement>('.modal-input');
    if (input && o.input) {
      wrap.querySelector('.field span')!.textContent = o.input.label;
      input.value = o.input.value ?? '';
      input.placeholder = o.input.placeholder ?? '';
    }
    const select = wrap.querySelector<HTMLSelectElement>('.modal-select');
    if (select && o.select) {
      wrap.querySelector('.field span')!.textContent = o.select.label;
      for (const opt of o.select.options) select.add(new Option(opt.label, opt.value));
    }
    wrap.querySelector('[data-r="cancel"]')!.textContent = o.cancel ?? 'Cancel';
    wrap.querySelector('[data-r="ok"]')!.textContent = o.confirm ?? 'OK';
    document.body.appendChild(wrap);
    const release = trapFocus(wrap);
    const done = (v: string | true | null) => { release(); wrap.remove(); prev?.focus?.({ preventScroll: true }); resolve(v); };
    const ok = () => done(input ? input.value : select ? select.value : true);
    wrap.addEventListener('click', (e) => {
      const r = (e.target as HTMLElement).closest<HTMLElement>('[data-r]')?.dataset.r;
      if (r === 'ok') ok(); else if (r === 'cancel' || e.target === wrap) done(null);
    });
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); done(null); }
      if (e.key === 'Enter' && e.target === input) ok();
    });
    (input ?? select ?? wrap.querySelector<HTMLElement>(o.danger ? '[data-r="cancel"]' : '[data-r="ok"]'))!.focus();
  });
}
