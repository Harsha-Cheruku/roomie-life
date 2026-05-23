import { useEffect } from "react";

/**
 * Requests the runtime permissions an Android 13+ user must explicitly grant
 * before the WebView can use the camera, photo library, or post notifications.
 *
 * Capacitor plugins each handle their own permission UI, but Android only
 * shows the system dialog the first time a plugin tries to use the API. We
 * proactively prompt on first native launch so the permissions appear in
 * Settings → Apps → RoomMate → Permissions immediately after install, and so
 * shared screenshots / push notifications work without surprise prompts.
 *
 * Web (PWA / preview): no-op.
 */
export const useNativeAndroidPermissions = () => {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;

        // 1) Camera + Photos (covers READ_MEDIA_IMAGES / READ_MEDIA_VIDEO on A13+)
        try {
          const { Camera } = await import("@capacitor/camera");
          const status = await Camera.checkPermissions();
          if (cancelled) return;
          const needs =
            status.camera !== "granted" || status.photos !== "granted";
          if (needs) {
            await Camera.requestPermissions({ permissions: ["camera", "photos"] });
          }
        } catch (e) {
          console.debug("Camera permission request skipped:", e);
        }

        // 2) POST_NOTIFICATIONS (Android 13+) — also covers local notifications
        try {
          const { LocalNotifications } = await import("@capacitor/local-notifications");
          const perm = await LocalNotifications.checkPermissions();
          if (cancelled) return;
          if (perm.display !== "granted") {
            await LocalNotifications.requestPermissions();
          }
        } catch (e) {
          console.debug("LocalNotifications permission request skipped:", e);
        }

        // Push notifications permission + FCM token registration is handled by
        // useNativeFcm (runs in Index.tsx once the user is authenticated).
      } catch (e) {
        console.debug("Native permission bootstrap skipped:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
};