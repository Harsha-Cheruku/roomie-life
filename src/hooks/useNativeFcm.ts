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
      } catch (e) {
        // Plugin not installed at runtime / running in web — ignore
        console.debug("Native FCM not available:", e);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);
};