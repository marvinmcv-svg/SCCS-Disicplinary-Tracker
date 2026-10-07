// Keeps a screen up to date with what other people save: re-runs its loader
// when the app comes back to the foreground and every `intervalMs` while it is
// visible. It never refreshes while someone is typing or has a dialog open, so
// an edit in progress is never overwritten.
import { useEffect, useRef } from 'react';

function userIsBusy(): boolean {
  if (document.querySelector('.modal-overlay, .palette-overlay, [role="dialog"][aria-modal="true"]')) return true;
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export function useLiveRefresh(load: () => unknown, intervalMs = 30_000): void {
  const ref = useRef(load);
  useEffect(() => { ref.current = load; });

  useEffect(() => {
    let last = 0;
    const run = () => {
      if (document.hidden || userIsBusy()) return;
      if (Date.now() - last < 500) return; // focus + visibility fire together
      last = Date.now();
      Promise.resolve(ref.current()).catch(() => undefined);
    };
    const onVisible = () => { if (!document.hidden) run(); };
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(run, intervalMs);
    return () => {
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [intervalMs]);
}
