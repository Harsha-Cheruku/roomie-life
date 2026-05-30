import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@roommate.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ---------- FCM HTTP v1 (native Android via Capacitor) ----------
const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || "";
let _fcmTokenCache: { token: string; exp: number } | null = null;

const b64url = (data: ArrayBuffer | Uint8Array | string): string => {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : data instanceof Uint8Array ? data : new Uint8Array(data);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

const getFcmAccessToken = async (): Promise<{ token: string; projectId: string } | null> => {
  if (!FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  let sa: any;
  try { sa = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON); } catch { return null; }
  const projectId = sa.project_id;
  if (!projectId || !sa.client_email || !sa.private_key) return null;

  const now = Math.floor(Date.now() / 1000);
  if (_fcmTokenCache && _fcmTokenCache.exp - 60 > now) {
    return { token: _fcmTokenCache.token, projectId };
  }

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!tokenResp.ok) {
    console.error("FCM oauth token exchange failed", tokenResp.status, await tokenResp.text());
    return null;
  }
  const json = await tokenResp.json();
  _fcmTokenCache = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return { token: json.access_token, projectId };
};

const sendFcm = async (
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<{ ok: boolean; code?: number }> => {
  const auth = await getFcmAccessToken();
  if (!auth) return { ok: false };
  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${auth.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title, body },
          data,
          android: { priority: "HIGH" },
        },
      }),
    },
  );
  if (resp.ok) return { ok: true };
  const txt = await resp.text();
  console.warn("FCM send failed", resp.status, txt);
  return { ok: false, code: resp.status };
};

interface PushPayload {
  user_id: string;
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  reference_type?: string;
}

const routeFor = (refType?: string) => {
  switch (refType) {
    case "expense": return "/expenses";
    case "task": return "/tasks";
    case "reminder": return "/reminders";
    case "alarm": return "/alarms";
    case "chat": return "/chat";
    default: return "/";
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error("VAPID keys not configured");
      return new Response(JSON.stringify({ error: "VAPID not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as PushPayload;
    if (!body?.user_id || !body?.title) {
      return new Response(JSON.stringify({ error: "Missing user_id or title" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, fcm_token, platform")
      .eq("user_id", body.user_id);

    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no-subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({
      title: body.title,
      body: body.body || "",
      url: body.url || routeFor(body.reference_type),
      tag: body.tag,
      requireInteraction: false,
      vibrate: [200, 100, 200],
    });

    const results = await Promise.allSettled(
      subs.map(async (s) => {
        // Native FCM token (Android via Capacitor) — dispatch via FCM HTTP v1
        if ((s as any).fcm_token) {
          const r = await sendFcm(
            (s as any).fcm_token,
            body.title,
            body.body || "",
            {
              url: body.url || routeFor(body.reference_type),
              tag: body.tag || "",
              reference_type: body.reference_type || "",
            },
          );
          if (!r.ok && (r.code === 404 || r.code === 400)) {
            await supabase.from("push_subscriptions").delete().eq("id", s.id);
          }
          return { id: s.id, ok: r.ok };
        }
        // Web Push (PWA / browser)
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          return { id: s.id, ok: true };
        } catch (e: any) {
          // 404/410 → subscription is dead, prune it
          const code = e?.statusCode || 0;
          if (code === 404 || code === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", s.id);
          }
          console.warn("push failed", code, e?.body || e?.message);
          return { id: s.id, ok: false, code };
        }
      }),
    );

    const sent = results.filter((r) => r.status === "fulfilled" && (r.value as any).ok).length;
    return new Response(JSON.stringify({ sent, total: subs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-push error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});