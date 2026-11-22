import type { Category, Group } from '../data/types';
import type { PersonalMarker } from '../db';
import { preparePhoto } from '../state/personal';
import { trapFocus } from './focus';
import { toast } from './toast';

export interface PersonalFormResult { name: string; category: string; customCategory?: string; note: string; photo?: Blob | null }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Add / edit a personal marker. Resolves null when cancelled. photo: Blob = new, null = removed, undefined = unchanged. */
export function personalForm(o: { title: string; groups: Group[]; categories: Category[]; initial?: PersonalMarker; note?: string; photoUrl?: string; customNames: string[] }): Promise<PersonalFormResult | null> {
  return new Promise((resolve) => {
    const prev = document.activeElement as HTMLElement | null;
    const init = o.initial;
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    const groups = [...o.groups].sort((a, b) => a.order - b.order);
    const opts = groups.map((g) => {
      const cs = o.categories.filter((c) => c.group === g.id && c.count > 0).sort((a, b) => a.name.localeCompare(b.name));
      return cs.length ? `<optgroup label="${esc(g.name)}">${cs.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</optgroup>` : '';
    }).join('');
    wrap.innerHTML = `
      <form class="modal pform" role="dialog" aria-modal="true" aria-labelledby="pf-t" novalidate>
        <h2 id="pf-t">${esc(o.title)}</h2>
        <label class="field"><span>Name</span><input name="name" required maxlength="80" autocomplete="off" placeholder="e.g. Car stash"></label>
        <label class="field"><span>Category</span>
          <select name="category"><option value="custom">Custom category…</option>${opts}</select></label>
        <label class="field custom-row"><span>Custom category</span><input name="custom" maxlength="40" list="pf-customs" placeholder="e.g. My stashes"><datalist id="pf-customs">${o.customNames.map((n) => `<option value="${esc(n)}">`).join('')}</datalist></label>
        <label class="field"><span>Note</span><textarea name="note" rows="2" maxlength="2000"></textarea></label>
        <div class="field"><span>Photo (optional, up to 5 MB)</span>
          <div class="photo-row">
            <img class="photo-prev" alt="" hidden>
            <label class="pill photo-pick">Choose photo<input type="file" name="photo" accept="image/*" hidden></label>
            <button type="button" class="pill photo-rm" hidden>Remove</button>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="pill" data-r="cancel">Cancel</button>
          <button type="submit" class="pill primary">Save</button>
        </div>
      </form>`;
    const form = wrap.querySelector('form')!;
    const $ = <T extends HTMLElement>(s: string) => form.querySelector<T>(s)!;
    const nameI = $<HTMLInputElement>('[name=name]'), catS = $<HTMLSelectElement>('[name=category]'), custI = $<HTMLInputElement>('[name=custom]'), noteT = $<HTMLTextAreaElement>('[name=note]');
    const prevImg = $<HTMLImageElement>('.photo-prev'), rm = $<HTMLButtonElement>('.photo-rm'), fileI = $<HTMLInputElement>('[name=photo]');
    nameI.value = init?.name ?? '';
    catS.value = init ? (init.customCategory ? 'custom' : init.category) : 'custom';
    custI.value = init?.customCategory ?? '';
    noteT.value = o.note ?? '';
    let photo: Blob | null | undefined;
    const showPrev = (url?: string) => { prevImg.hidden = !url; rm.hidden = !url; if (url) prevImg.src = url; };
    showPrev(o.photoUrl);
    const syncCustom = () => { $<HTMLElement>('.custom-row').hidden = catS.value !== 'custom'; };
    syncCustom();
    catS.addEventListener('change', syncCustom);
    fileI.addEventListener('change', async () => {
      const f = fileI.files?.[0];
      if (!f) return;
      try { photo = await preparePhoto(f); showPrev(URL.createObjectURL(photo)); } catch (e) { toast((e as Error).message); }
      fileI.value = '';
    });
    rm.addEventListener('click', () => { photo = null; showPrev(undefined); });
    document.body.appendChild(wrap);
    const release = trapFocus(wrap);
    const done = (v: PersonalFormResult | null) => { release(); wrap.remove(); prev?.focus?.({ preventScroll: true }); resolve(v); };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!nameI.value.trim()) { nameI.focus(); toast('Give it a name'); return; }
      const custom = catS.value === 'custom';
      done({ name: nameI.value.trim(), category: custom ? 'custom' : catS.value, customCategory: custom ? custI.value.trim() || 'My markers' : undefined, note: noteT.value, photo });
    });
    wrap.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-r="cancel"]') || e.target === wrap) done(null); });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } });
    nameI.focus();
  });
}
