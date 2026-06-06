import { useEffect, useRef } from 'react';

/**
 * Runs `fn` on mount, then every `intervalMs` — but only while the document
 * is visible. Pauses when the tab is hidden, refires immediately when it
 * becomes visible again. Used to replace always-on realtime channels for
 * non-critical widgets and counters (much cheaper on the backend).
 */
export const useVisibilityPoll = (
  fn: () => void | Promise<void>,
  intervalMs: number,
  deps: ReadonlyArray<unknown> = [],
  enabled = true,
) => {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (document.visibilityState === 'visible') {
        void fnRef.current();
      }
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fnRef.current();
        start();
      } else {
        stop();
      }
    };

    // Initial fetch + start
    void fnRef.current();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, ...deps]);
};