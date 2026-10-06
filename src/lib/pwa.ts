'use client';

// Progressive Web App plumbing: service worker registration and the browser's
// install prompt, exposed as a tiny external store for useSyncExternalStore.
//
// Chrome, Edge and Android fire `beforeinstallprompt` once, early, so it is
// captured by the inline boot script (src/lib/boot-script.ts) and handed over
// here when <PwaSetup /> mounts.
// iOS and macOS Safari never fire it: installing there is a manual "Share >
// Add to Home Screen" (or "File > Add to Dock"), so we show instructions.

type InstallOutcome = 'accepted' | 'dismissed';
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome }>;
}

export type InstallState = {
  /** Running as an installed app (standalone window). */
  installed: boolean;
  /** The browser offered a native install prompt. */
  canPrompt: boolean;
  /** Safari on iPhone/iPad: install through the Share sheet. */
  ios: boolean;
};

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { installed: false, canPrompt: false, ios: false };
const listeners = new Set<() => void>();
let started = false;

function set(next: Partial<InstallState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function startPwa() {
  if (started || typeof window === 'undefined') return;
  started = true;

  state = { installed: isStandalone(), canPrompt: false, ios: isIos() };

  // The boot script may have caught the event before React hydrated.
  const early = (window as Window & { __sccsInstallEvent?: BeforeInstallPromptEvent }).__sccsInstallEvent;
  if (early) {
    deferred = early;
    state = { ...state, canPrompt: true };
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ canPrompt: false, installed: true });
  });
  window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => set({ installed: e.matches }));

  if ('serviceWorker' in navigator && window.isSecureContext) {
    const register = () =>
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => console.warn('Service worker registration failed', err));
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
}

export async function promptInstall(): Promise<InstallOutcome | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const event = deferred;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  set({ canPrompt: false });
  return outcome;
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const getInstallState = () => state;
const SERVER_STATE: InstallState = { installed: false, canPrompt: false, ios: false };
export const getServerInstallState = () => SERVER_STATE;
