import { useState } from "react";
import { Download, Send, Smartphone, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Super-admin tooling for finishing the native Android build:
 *  1. Download the project's google-services.json straight from the secret
 *     stored in Lovable Cloud (so the user never has to copy/paste it).
 *  2. Send a real FCM/Web push to themselves to verify end-to-end delivery.
 */
export default function AdminNativeSetup() {
  const { user, session } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);
  const [tokens, setTokens] = useState<{ fcm: number; web: number } | null>(null);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

  const downloadConfig = async () => {
    if (!session) return;
    setDownloading(true);
    try {
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/download-firebase-config`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "google-services.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("google-services.json downloaded");
    } catch (e) {
      toast.error(`Download failed: ${(e as Error).message}`);
    } finally {
      setDownloading(false);
    }
  };

  const checkTokens = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, fcm_token, platform")
      .eq("user_id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    const fcm = (data ?? []).filter((s) => !!s.fcm_token).length;
    const web = (data ?? []).filter((s) => !s.fcm_token).length;
    setTokens({ fcm, web });
    if (fcm + web === 0) {
      toast.warning("No push subscriptions for your account yet");
    } else {
      toast.success(`Found ${fcm} native + ${web} web subscription(s)`);
    }
  };

  const sendTestPush = async () => {
    if (!user) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-push", {
        body: {
          user_id: user.id,
          title: "RoomMate push test",
          body: "If you see this, FCM + Web Push are working ✅",
          reference_type: "general",
          tag: `test-${Date.now()}`,
        },
      });
      if (error) throw error;
      toast.success(`Delivered to ${data?.sent ?? 0} / ${data?.total ?? 0} device(s)`);
    } catch (e) {
      toast.error(`Push failed: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Native Android setup</h1>
        <p className="text-sm text-muted-foreground">
          Firebase Cloud Messaging tooling for the Capacitor APK build.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> 1. google-services.json
          </CardTitle>
          <CardDescription>
            Download the Firebase config stored in Lovable Cloud and place it at{" "}
            <code className="rounded bg-muted px-1">android/app/google-services.json</code>{" "}
            before running <code className="rounded bg-muted px-1">npx cap sync android</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={downloadConfig} disabled={downloading || !session}>
            <Download className="mr-2 h-4 w-4" />
            {downloading ? "Downloading…" : "Download google-services.json"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4" /> 2. Verify token registration
          </CardTitle>
          <CardDescription>
            After installing the APK and signing in on the device, the app calls{" "}
            <code className="rounded bg-muted px-1">useNativeFcm</code> and saves the FCM
            token to <code className="rounded bg-muted px-1">push_subscriptions</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="outline" onClick={checkTokens}>
            Check my push subscriptions
          </Button>
          {tokens && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
              {tokens.fcm + tokens.web > 0 ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600" />
              )}
              <span>
                Native FCM tokens: <strong>{tokens.fcm}</strong> · Web Push subscriptions:{" "}
                <strong>{tokens.web}</strong>
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4" /> 3. Send a test push
          </CardTitle>
          <CardDescription>
            Sends a real notification to every device subscribed under your account
            via the <code className="rounded bg-muted px-1">send-push</code> edge function.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={sendTestPush} disabled={sending}>
            <Send className="mr-2 h-4 w-4" />
            {sending ? "Sending…" : "Send test push to my devices"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}