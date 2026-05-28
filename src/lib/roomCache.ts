// Simple in-memory per-room data cache.
// Used to instantly hydrate room-scoped screens (Expenses overview, lists,
// balances, etc.) when the user switches rooms, so the UI never shows a
// full-page spinner while a fresh fetch runs in the background.
//
// This is intentionally a plain Map kept alive for the SPA session — it is
// cleared on full reload / sign-out, and bounded by the number of rooms a
// user belongs to, so memory is a non-issue.

const stores: Record<string, Map<string, unknown>> = {};

const getStore = (namespace: string): Map<string, unknown> => {
  let store = stores[namespace];
  if (!store) {
    store = new Map();
    stores[namespace] = store;
  }
  return store;
};

export const getRoomCache = <T>(namespace: string, roomId: string | null | undefined): T | undefined => {
  if (!roomId) return undefined;
  return getStore(namespace).get(roomId) as T | undefined;
};

export const setRoomCache = <T>(namespace: string, roomId: string | null | undefined, value: T): void => {
  if (!roomId) return;
  getStore(namespace).set(roomId, value);
};

export const clearRoomCache = (namespace?: string, roomId?: string): void => {
  if (namespace && roomId) {
    stores[namespace]?.delete(roomId);
    return;
  }
  if (namespace) {
    delete stores[namespace];
    return;
  }
  for (const key of Object.keys(stores)) delete stores[key];
};