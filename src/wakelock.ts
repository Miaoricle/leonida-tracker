// "Keep screen awake" (Screen Wake Lock API). The lock is released by the browser when the app is hidden,
// so it's re-acquired whenever the app becomes visible again.
let sentinel: WakeLockSentinel | null = null;
let wanted = false;

export const wakeLockSupported = () => 'wakeLock' in navigator;

async function acquire() {
  if (!wanted || !wakeLockSupported() || document.visibilityState !== 'visible' || sentinel) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch { /* e.g. low battery mode */ }
}

document.addEventListener('visibilitychange', () => void acquire());

export async function setKeepAwake(on: boolean) {
  wanted = on;
  if (on) await acquire();
  else { await sentinel?.release().catch(() => {}); sentinel = null; }
}
