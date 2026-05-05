/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
cleanupOutdatedCaches();

// Precache injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigation fallback (deny ~oauth)
registerRoute(
  new NavigationRoute(
    async ({ event }) => {
      try {
        return await fetch((event as FetchEvent).request);
      } catch {
        const cache = await caches.open("workbox-precache");
        const fallback = await cache.match("/index.html");
        return fallback || Response.error();
      }
    },
    { denylist: [/^\/~oauth/] }
  )
);

// Runtime caching
registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new CacheFirst({
    cacheName: "google-fonts-cache",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);
registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "gstatic-fonts-cache",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);
registerRoute(
  ({ url }) => url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/"),
  new NetworkFirst({
    cacheName: "supabase-api-cache",
    networkTimeoutSeconds: 10,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 5 }),
    ],
  })
);

// ----- Push notifications (works when app/tab is closed) -----
interface PushPayload {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  data?: Record<string, unknown>;
  renotify?: boolean;
  requireInteraction?: boolean;
  silent?: boolean;
  vibrate?: number[];
}

self.addEventListener("push", (event: PushEvent) => {
  let payload: PushPayload = {};
  try {
    if (event.data) {
      const text = event.data.text();
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { title: "RoomMate", body: text };
      }
    }
  } catch (e) {
    payload = { title: "RoomMate", body: "You have a new notification" };
  }

  const title = payload.title || "RoomMate";
  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    tag: payload.tag,
    renotify: payload.renotify ?? Boolean(payload.tag),
    requireInteraction: payload.requireInteraction ?? false,
    silent: payload.silent ?? false,
    data: { ...(payload.data || {}), url: payload.url || "/" },
    vibrate: payload.vibrate || [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl = ((event.notification.data as { url?: string } | null)?.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            (client as WindowClient).navigate(targetUrl).catch(() => {});
            return (client as WindowClient).focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});

// Allow the page to ask the SW to activate immediately
self.addEventListener("message", (event) => {
  if (event.data && (event.data as { type?: string }).type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});