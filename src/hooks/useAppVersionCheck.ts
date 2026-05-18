import { useEffect, useRef } from "react";

declare const __APP_BUILD_ID__: string;
const CURRENT_BUILD_ID =
  typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "dev";
const STORAGE_KEY = "app_build_id";
const POLL_INTERVAL_MS = 60_000;

async function fetchRemoteBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { buildId?: string };
    return data.buildId ?? null;
  } catch {
    return null;
  }
}

async function nukeCachesAndSW() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update().catch(() => {})));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}
}

/**
 * Polls /version.json and reloads when the deployed build id changes.
 * Also reloads when the tab becomes visible after a new deploy.
 */
export function useAppVersionCheck() {
  const reloadingRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, CURRENT_BUILD_ID);
    } catch {}

    const triggerReloadIfStale = async () => {
      if (reloadingRef.current) return;
      const remote = await fetchRemoteBuildId();
      if (!remote || remote === CURRENT_BUILD_ID) return;
      reloadingRef.current = true;
      await nukeCachesAndSW();
      // Hard reload bypassing any HTML cache
      const url = new URL(window.location.href);
      url.searchParams.set("v", remote);
      window.location.replace(url.toString());
    };

    // Initial check shortly after mount
    const initial = window.setTimeout(triggerReloadIfStale, 4000);
    const interval = window.setInterval(triggerReloadIfStale, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") triggerReloadIfStale();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", triggerReloadIfStale);
    window.addEventListener("online", triggerReloadIfStale);

    // If the active SW changes (new build activated), reload once.
    const onControllerChange = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener?.(
      "controllerchange",
      onControllerChange
    );

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", triggerReloadIfStale);
      window.removeEventListener("online", triggerReloadIfStale);
      navigator.serviceWorker?.removeEventListener?.(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);
}