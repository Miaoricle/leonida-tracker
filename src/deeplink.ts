// Deep links: ?feature=<category> · ?m=<markerId> · ?v=<vehicle> · ?w=<weapon> · ?ms=<mission> · ?at=x,y,zoom ("Shared spot"). The URL is kept in sync with
// history.replaceState so the address bar (and a reload) always reflects what's open.

export interface LinkState { feature?: string | null; m?: string | null; v?: string | null; w?: string | null; ms?: string | null; at?: { x: number; y: number; z: number } | null }

export function parseLink(search = location.search): LinkState {
  const p = new URLSearchParams(search);
  const out: LinkState = {};
  if (p.get('feature')) out.feature = p.get('feature');
  if (p.get('m')) out.m = p.get('m');
  if (p.get('v')) out.v = p.get('v');
  if (p.get('w')) out.w = p.get('w');
  if (p.get('ms')) out.ms = p.get('ms');
  const at = p.get('at')?.split(',').map(Number);
  if (at && at.length >= 2 && at.slice(0, 2).every(Number.isFinite)) out.at = { x: at[0], y: at[1], z: Number.isFinite(at[2]) ? at[2] : 5 };
  return out;
}

export function formatAt(x: number, y: number, z: number): string {
  return `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
}

/** Replace the current URL's link params (others are kept). Pass null to remove a param. */
export function syncUrl(s: LinkState): void {
  const u = new URL(location.href);
  const set = (k: string, v: string | null | undefined) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
  if ('feature' in s) set('feature', s.feature);
  if ('m' in s) set('m', s.m);
  if ('v' in s) set('v', s.v);
  if ('w' in s) set('w', s.w);
  if ('ms' in s) set('ms', s.ms);
  if ('at' in s) set('at', s.at ? formatAt(s.at.x, s.at.y, s.at.z) : null);
  const next = u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : '') + u.hash;
  if (next !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', next);
}
