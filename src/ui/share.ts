import { toast } from './toast';

/** Absolute app URL with the given query params. */
export function appUrl(params: Record<string, string>): string {
  const u = new URL(import.meta.env.BASE_URL, location.origin);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/** navigator.share when available, otherwise copy to clipboard with a "Link copied" toast. */
export async function shareLink(url: string, title: string, preferCopy = false): Promise<void> {
  if (!preferCopy && navigator.share) {
    try { await navigator.share({ title, url }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  await copyText(url);
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
  }
  toast('Link copied');
}
