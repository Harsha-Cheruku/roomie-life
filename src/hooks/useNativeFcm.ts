import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Registers Capacitor PushNotifications on native Android (and iOS) and
 * stores the FCM token in `push_subscriptions.fcm_token` so the `send-push`
 * edge function can deliver real native system notifications.
 *
 * Falls back silently (no-op) on web.
 */
export const useNativeFcm = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;

        const { PushNotifications } = await import("@capacitor/push-notifications");

        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
          perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive !== "granted") return;

        await PushNotifications.register();

        await PushNotifications.addListener("registration", async (token) => {
          if (cancelled || !token?.value) return;
          const platform = Capacitor.getPlatform(); // 'android' | 'ios'
          const { error } = await supabase
            .from("push_subscriptions")
            .upsert(
              {
                user_id: user.id,
                endpoint: `fcm:${token.value}`,
                p256dh: "",
                auth: "",
                fcm_token: token.value,
                platform,
              },
              { onConflict: "user_id,endpoint" },
            );
          if (error) console.warn("Failed to save FCM token:", error);
        });

        await PushNotifications.addListener("registrationError", (err) => {
          console.warn("FCM registration error:", err);
        });

        // Tap on notification while app in background or killed
        await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const data = (action?.notification?.data || {}) as Record<string, string>;
            const url = routeFromData(data);
            if (url) {
              try { window.history.pushState({}, "", url); window.dispatchEvent(new PopStateEvent("popstate")); }
              catch { window.location.assign(url); }
            }
          },
        );

        // Notification arrives in foreground — show a soft toast + still allow tap routing
        await PushNotifications.addListener("pushNotificationReceived", (n) => {
          const data = (n?.data || {}) as Record<string, string>;
          // Stash for any in-app banner consumer; do not auto-navigate in foreground
          try {
            sessionStorage.setItem(
              "roommate_last_push",
              JSON.stringify({ title: n.title, body: n.body, data, ts: Date.now() }),
            );
            window.dispatchEvent(new CustomEvent("roommate-push-received", { detail: { title: n.title, body: n.body, data } }));
          } catch {}
        });
      } catch (e) {
        // Plugin not installed at runtime / running in web — ignore
        console.debug("Native FCM not available:", e);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);
};

const routeFromData = (data: Record<string, string>): string | null => {
  if (data?.url && typeof data.url === "string" && data.url.startsWith("/")) return data.url;
  const ref = data?.reference_type;
  const id = data?.reference_id;
  switch (ref) {
    case "task": return "/tasks";
    case "expense": return "/expenses";
    case "recurring_bill": return id ? `/recurring-bills?confirm=${id}` : "/recurring-bills";
    case "reminder": return "/reminders";
    case "alarm": return "/alarms";
    case "chat": return "/chat";
    case "game": return "/games";
    case "room": return "/room-settings";
    default: return "/notifications";
  }
};