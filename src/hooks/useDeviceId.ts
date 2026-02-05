import { useMemo } from "react";

const DEVICE_ID_STORAGE_KEY = "roomsync_device_id";

let inMemoryDeviceId: string | null = null;

function generateDeviceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  // Fallback: sufficiently unique for client-side device identity.
  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getDeviceId(): string {
  if (inMemoryDeviceId) return inMemoryDeviceId;

  // SSR/edge safety (shouldn't happen in this Vite app, but keeps it robust)
  if (typeof window === "undefined") {
    inMemoryDeviceId = generateDeviceId();
    return inMemoryDeviceId;
  }

  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) {
      inMemoryDeviceId = existing;
      return existing;
    }

    const next = generateDeviceId();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, next);
    inMemoryDeviceId = next;
    return next;
  } catch {
    // localStorage may be blocked; fallback to an in-memory id for this session.
    inMemoryDeviceId = generateDeviceId();
    return inMemoryDeviceId;
  }
}

export function useDeviceId(): string {
  return useMemo(() => getDeviceId(), []);
}
