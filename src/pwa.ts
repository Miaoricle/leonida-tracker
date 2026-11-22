import { registerSW } from 'virtual:pwa-register';
import { toast } from './ui/toast';

/** Service worker (prompt mode): a new version shows "Update available, tap to refresh". */
export function initPwa(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast('Update available', { ms: 60_000, action: { label: 'Tap to refresh', run: () => void update(true) } });
    },
    onRegisteredSW(_url, reg) {
      // look for a new version every hour while the app stays open
      if (reg) setInterval(() => { if (navigator.onLine) void reg.update(); }, 3600_000);
    },
  });
}

/** "Offline" chip while navigator.onLine is false. */
export function initOfflineChip(): void {
  const chip = document.createElement('div');
  chip.className = 'offline-chip';
  chip.setAttribute('role', 'status');
  chip.textContent = 'Offline';
  document.body.appendChild(chip);
  const sync = () => { chip.hidden = navigator.onLine; };
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}
