import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Download, Share, MoreVertical, Plus, Check, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import logoImg from "@/assets/logo.jpg";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// Direct APK download URL for Android users. Replace with the hosted APK URL
// (e.g. GitHub Releases asset). Kept as a constant so it's easy to update.
const ANDROID_APK_URL =
  (import.meta.env.VITE_ANDROID_APK_URL as string | undefined) ||
  "/downloads/roommate-latest.apk";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Install() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const [downloadingFcm, setDownloadingFcm] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) setPlatform("ios");
    else if (/android/.test(ua)) setPlatform("android");
    else setPlatform("desktop");

    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleDownloadGoogleServices = async () => {
    setDownloadingFcm(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Sign in required", description: "Please sign in to download Firebase config.", variant: "destructive" });
        return;
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-firebase-config`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({} as any));
        throw new Error(j.error || `Download failed (${resp.status})`);
      }
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "google-services.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast({ title: "Downloaded", description: "Place this file in android/app/ before building." });
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setDownloadingFcm(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Header */}
      <header className="px-4 pt-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-display text-xl font-bold text-foreground">
            Install RoomMate
          </h1>
        </div>
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* App Preview */}
        <div className="text-center py-6">
          <img
            src={logoImg}
            alt="RoomMate"
            className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-lg object-contain"
          />
          <h2 className="font-display text-2xl font-bold text-foreground">RoomMate</h2>
          <p className="text-muted-foreground mt-1">Shared Living Super App</p>

          {isInstalled ? (
            <div className="mt-4 inline-flex items-center gap-2 bg-mint/20 text-mint px-4 py-2 rounded-full text-sm font-medium">
              <Check className="w-4 h-4" />
              Already Installed
            </div>
          ) : deferredPrompt ? (
            <Button onClick={handleInstall} className="mt-4 gap-2" size="lg">
              <Download className="w-5 h-5" />
              Install Now
            </Button>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Follow the steps below for your device
            </p>
          )}
        </div>

        {/* Platform Tabs */}
        <div className="flex gap-2">
          {(["ios", "android", "desktop"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-sm font-medium transition-all",
                platform === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {p === "ios" ? "iPhone / iPad" : p === "android" ? "Android" : "Desktop"}
            </button>
          ))}
        </div>

        {/* iOS Instructions */}
        {platform === "ios" && (
          <Card>
            <CardContent className="p-5 space-y-5">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-primary" />
                Install on iPhone / iPad
              </h3>

              <Step
                number={1}
                title="Open in Safari"
                description="Make sure you're viewing this page in Safari (not Chrome or other browsers). Safari is required for installing web apps on iOS."
              />
              <Step
                number={2}
                title="Tap the Share button"
                description="Tap the Share icon at the bottom of Safari (the square with an arrow pointing up)."
                icon={<Share className="w-5 h-5 text-primary" />}
              />
              <Step
                number={3}
                title='Tap "Add to Home Screen"'
                description='Scroll down in the share menu and tap "Add to Home Screen". You may need to scroll right to find it.'
                icon={<Plus className="w-5 h-5 text-primary" />}
              />
              <Step
                number={4}
                title='Tap "Add"'
                description='Confirm by tapping "Add" in the top right corner. RoomMate will appear on your home screen like a native app!'
              />
            </CardContent>
          </Card>
        )}

        {/* Android Instructions */}
        {platform === "android" && (
          <Card>
            <CardContent className="p-5 space-y-5">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-primary" />
                Install on Android
              </h3>

              {/* Direct APK download (native build) */}
              <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <Download className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm">
                      Get the Android app (APK)
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Full native experience with background notifications, alarms and offline mode.
                    </p>
                    <a
                      href={ANDROID_APK_URL}
                      download
                      rel="noopener"
                      className="inline-flex items-center gap-2 mt-3 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition"
                    >
                      <Download className="w-4 h-4" />
                      Download APK
                    </a>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      After download, open the file and allow install from your browser if prompted.
                    </p>
                  </div>
                </div>
              </div>

              {/* Firebase google-services.json download (for native builders) */}
              <div className="bg-muted/40 border border-border rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <Download className="w-5 h-5 text-foreground/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm">
                      Firebase config (for developers)
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Download <code className="text-[11px]">google-services.json</code> and place it in
                      <code className="text-[11px]"> android/app/</code> before running
                      <code className="text-[11px]"> npx cap sync</code>.
                    </p>
                    <button
                      onClick={handleDownloadGoogleServices}
                      disabled={downloadingFcm}
                      className="inline-flex items-center gap-2 mt-3 h-9 px-3 rounded-lg bg-foreground text-background text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      {downloadingFcm ? "Downloading…" : "Download google-services.json"}
                    </button>
                  </div>
                </div>
              </div>

              {deferredPrompt ? (
                <div className="bg-primary/10 rounded-xl p-4 text-center">
                  <p className="text-sm text-foreground mb-3">
                    Or install as a web app — no download needed.
                  </p>
                  <Button onClick={handleInstall} className="gap-2">
                    <Download className="w-4 h-4" />
                    Install Web App
                  </Button>
                </div>
              ) : (
                <>
                  <Step
                    number={1}
                    title="Open in Chrome"
                    description="Make sure you're viewing this page in Google Chrome for the best experience."
                  />
                  <Step
                    number={2}
                    title="Tap the menu (⋮)"
                    description="Tap the three dots menu in the top-right corner of Chrome."
                    icon={<MoreVertical className="w-5 h-5 text-primary" />}
                  />
                  <Step
                    number={3}
                    title='Tap "Add to Home screen"'
                    description='Select "Add to Home screen" or "Install app" from the menu.'
                    icon={<Download className="w-5 h-5 text-primary" />}
                  />
                  <Step
                    number={4}
                    title='Tap "Install"'
                    description="Confirm the installation. RoomMate will be added to your home screen and app drawer!"
                  />
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Desktop Instructions */}
        {platform === "desktop" && (
          <Card>
            <CardContent className="p-5 space-y-5">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-primary" />
                Install on Desktop
              </h3>

              {deferredPrompt ? (
                <div className="bg-primary/10 rounded-xl p-4 text-center">
                  <p className="text-sm text-foreground mb-3">
                    Your browser supports direct installation!
                  </p>
                  <Button onClick={handleInstall} className="gap-2">
                    <Download className="w-4 h-4" />
                    Install Now
                  </Button>
                </div>
              ) : (
                <>
                  <Step
                    number={1}
                    title="Open in Chrome or Edge"
                    description="Use Google Chrome or Microsoft Edge for the best installation experience."
                  />
                  <Step
                    number={2}
                    title="Look for the install icon"
                    description='Click the install icon in the address bar (it looks like a monitor with a download arrow), or go to the browser menu.'
                    icon={<Download className="w-5 h-5 text-primary" />}
                  />
                  <Step
                    number={3}
                    title="Confirm installation"
                    description='Click "Install" in the prompt. RoomMate will open as a standalone app window!'
                  />
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Benefits */}
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-lg mb-4">Why install?</h3>
            <div className="space-y-3">
              {[
                { emoji: "⚡", text: "Faster loading – opens instantly like a native app" },
                { emoji: "📱", text: "Full screen experience – no browser bars" },
                { emoji: "📴", text: "Works offline – access your data anytime" },
                { emoji: "🔔", text: "Push notifications – stay updated in real-time" },
                { emoji: "🏠", text: "Home screen icon – one tap to open" },
              ].map((item) => (
                <div key={item.text} className="flex items-start gap-3">
                  <span className="text-xl">{item.emoji}</span>
                  <p className="text-sm text-foreground">{item.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  description,
  icon,
}: {
  number: number;
  title: string;
  description: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-bold text-primary">
        {icon || number}
      </div>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}
