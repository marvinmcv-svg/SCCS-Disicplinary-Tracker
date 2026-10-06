'use client';

// Appearance: 'system' follows the device, or the user pins light or dark.
// The choice is stored per device and applied as `html.dark` before first
// paint by BOOT_SCRIPT (src/lib/boot-script.ts), so there is no flash.

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'sccs-theme';
const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let pref: ThemePref = 'system';
let started = false;

function systemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply() {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  const meta = document.querySelectorAll('meta[name="theme-color"]');
  meta.forEach((m) => m.setAttribute('content', dark ? '#000000' : '#f5f5f7'));
}

export function startTheme() {
  if (started || typeof window === 'undefined') return;
  started = true;
  pref = readPref();
  apply();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (pref === 'system') {
      apply();
      listeners.forEach((l) => l());
    }
  });
}

export function setThemePref(next: ThemePref) {
  pref = next;
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* private mode: the choice lasts for this visit only */
  }
  apply();
  listeners.forEach((l) => l());
}

export const getThemePref = () => pref;
export const getServerThemePref = (): ThemePref => 'system';
export const isDarkNow = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

