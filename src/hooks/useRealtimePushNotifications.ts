/**
 * Disabled: realtime fallback channel removed to cut a persistent socket per
 * logged-in user. Users who enable Web Push already receive OS-level
 * notifications via the send-push edge function + Service Worker; users who
 * don't enable push will see the in-app notification bell update on its
 * 45-second visibility poll. Keeping this exported as a no-op so existing
 * imports continue to compile.
 */
export const useRealtimePushNotifications = () => {
  // no-op
};
