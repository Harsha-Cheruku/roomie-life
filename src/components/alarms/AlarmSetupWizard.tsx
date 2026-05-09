import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import NativeAlarm from "@/plugins/NativeAlarmPlugin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle2, AlertTriangle, Loader2, RefreshCw, ChevronDown, ChevronUp, Bug, BellRing, Battery, Layers, Zap, ShieldAlert, Smartphone, PlayCircle, ExternalLink, ArrowRight } from "lucide-react";
import { toast } from "sonner";

type Diag = Awaited<ReturnType<typeof NativeAlarm.getDiagnostics>>;

/** Definition of one permission/setting step. */
interface StepDef {
  key: "notifications" | "channel" | "exact" | "battery" | "overlay" | "autostart";
  title: string;
  why: string;
  /** Plain-language steps the user will see on the system settings screen. */
  steps: string[];
  buttonLabel: string;
  /** Open the relevant native settings screen. */
  open: () => Promise<unknown>;
  /** Determines whether this step now passes after re-check. */
  isOk: (d: Diag) => boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called once user passes all critical checks. */
  onReady?: () => void;
  /** Called when the user finishes the setup flow (after success screen). */
  onComplete?: () => void;
  /** When true, on first reaching all-green show a success screen with auto test alarm. */
  showSuccessScreen?: boolean;
}

const importanceLabel = (n: number) => ["None", "Min", "Low", "Default", "High", "Urgent"][n] ?? "Unknown";

const OEM_TIPS: Record<string, string> = {
  xiaomi: "Open Settings → Apps → RoomMate → enable Autostart, then Battery saver → No restrictions.",
  redmi: "Settings → Apps → RoomMate → Autostart ON. Battery saver → No restrictions. Lock app in recents.",
  poco: "Settings → Apps → RoomMate → Autostart ON. Battery saver → No restrictions. Lock app in recents.",
  oppo: "Settings → Battery → App battery management → RoomMate → Allow background activity & Auto launch.",
  realme: "Settings → Battery → App battery management → RoomMate → Allow background activity & Auto launch.",
  vivo: "Settings → Battery → Background power consumption → RoomMate → Allow. Also enable High background power.",
  iqoo: "Settings → Battery → Background power consumption → RoomMate → Allow.",
  huawei: "Phone Manager → App launch → RoomMate → Manage manually → enable all three toggles.",
  honor: "Phone Manager → App launch → RoomMate → Manage manually → enable all three toggles.",
  samsung: "Settings → Apps → RoomMate → Battery → Unrestricted. Device care → Battery → Background usage limits → ensure RoomMate is NOT sleeping.",
  oneplus: "Settings → Battery → Battery optimization → RoomMate → Don't optimize. Recent apps → lock RoomMate.",
};

function tipFor(manufacturer: string): string | null {
  const key = (manufacturer || "").toLowerCase();
  for (const k of Object.keys(OEM_TIPS)) if (key.includes(k)) return OEM_TIPS[k];
  return null;
}

function StatusRow({
  icon, label, ok, onFix, fixLabel = "Fix now", required = true, hint,
}: { icon: React.ReactNode; label: string; ok: boolean; onFix?: () => void; fixLabel?: string; required?: boolean; hint?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-b-0">
      <div className="mt-0.5 text-primary">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">{label}</p>
          {!required && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Optional</Badge>}
        </div>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {ok ? (
        <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
      ) : (
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          {onFix && (
            <Button size="sm" variant={required ? "default" : "outline"} onClick={onFix}>
              {fixLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function AlarmSetupWizard({ open, onOpenChange, onReady, onComplete, showSuccessScreen = false }: Props) {
  const isAndroid = Capacitor.getPlatform() === "android";
  const [diag, setDiag] = useState<Diag | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [testing, setTesting] = useState(false);
  const [successShown, setSuccessShown] = useState(false);
  const [reachedOkInSession, setReachedOkInSession] = useState(false);
  const [autoTestScheduled, setAutoTestScheduled] = useState<{ hour: number; minute: number } | null>(null);
  const [activeStep, setActiveStep] = useState<StepDef | null>(null);
  // Phase: 'instructions' = explain before opening; 'confirm' = user returned, ask if done.
  const [stepPhase, setStepPhase] = useState<"instructions" | "confirm">("instructions");
  const [stepOpening, setStepOpening] = useState(false);
  const [stepRechecking, setStepRechecking] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAndroid) return;
    setLoading(true);
    try {
      const d = await NativeAlarm.getDiagnostics();
      setDiag(d);
    } catch (e) {
      console.error("getDiagnostics failed", e);
      toast.error("Could not read device status");
    } finally {
      setLoading(false);
    }
  }, [isAndroid]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  // Re-check whenever the user returns from a system settings screen.
  useEffect(() => {
    if (!open) return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
      // If a step is in-flight and we just came back from system settings,
      // automatically move to the confirm phase.
      setActiveStep((s) => {
        if (s && stepPhase === "instructions" && stepOpening) {
          setStepPhase("confirm");
          setStepOpening(false);
        }
        return s;
      });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, refresh, stepPhase, stepOpening]);

  const criticalOk = !!diag &&
    diag.notificationsEnabled &&
    diag.channelImportance >= 4 &&
    diag.exactAlarmGranted &&
    diag.ignoringBatteryOptimization;

  // Track when user transitions from "not ok" to "ok" within this session.
  useEffect(() => {
    if (!open) return;
    if (criticalOk && !successShown && showSuccessScreen) {
      setReachedOkInSession(true);
    }
  }, [criticalOk, open, showSuccessScreen, successShown]);

  // Auto-schedule a 2-min verification alarm the first time we reach success.
  useEffect(() => {
    if (!open || !showSuccessScreen) return;
    if (criticalOk && reachedOkInSession && !successShown && !autoTestScheduled) {
      (async () => {
        try {
          const r = await NativeAlarm.scheduleTestAlarm({ minutes: 2 });
          setAutoTestScheduled({ hour: r.hour, minute: r.minute });
        } catch {
          /* non-fatal */
        } finally {
          setSuccessShown(true);
        }
      })();
    }
  }, [criticalOk, reachedOkInSession, open, showSuccessScreen, successShown, autoTestScheduled]);

  const handleTest = async () => {
    if (!isAndroid) { toast.info("Test alarm only works on the installed Android app."); return; }
    setTesting(true);
    try {
      const r = await NativeAlarm.scheduleTestAlarm({ minutes: 2 });
      const hh = String(r.hour).padStart(2, "0");
      const mm = String(r.minute).padStart(2, "0");
      toast.success(`Test alarm set for ${hh}:${mm}`, {
        description: "Lock your phone & close the app. It must ring within 2 minutes.",
        duration: 8000,
      });
    } catch (e) {
      toast.error("Could not schedule test alarm");
    } finally {
      setTesting(false);
    }
  };

  const STEPS: StepDef[] = [
    {
      key: "notifications",
      title: "Allow notifications",
      why: "Android needs permission to show the full-screen alarm. Without this, alarms stay silent.",
      steps: [
        "We'll open RoomMate's Notification settings.",
        "Turn the main 'Allow notifications' toggle ON.",
        "Come back to RoomMate when you're done.",
      ],
      buttonLabel: "Open Notification settings",
      open: () => NativeAlarm.openNotificationSettings(),
      isOk: (d) => d.notificationsEnabled,
    },
    {
      key: "channel",
      title: "Set alarm importance to Urgent",
      why: "The alarm channel must be Urgent (or High) so it bypasses Do Not Disturb and pops up over the lock screen.",
      steps: [
        "We'll open the 'Alarms' notification channel.",
        "Set Importance to 'Urgent' (or 'High').",
        "Make sure Sound is enabled and 'Override Do Not Disturb' is ON if available.",
        "Come back to RoomMate when you're done.",
      ],
      buttonLabel: "Open Alarm channel settings",
      open: () => NativeAlarm.openChannelSettings(),
      isOk: (d) => d.channelImportance >= 4,
    },
    {
      key: "exact",
      title: "Allow exact alarms",
      why: "Without this, Android may delay alarms by minutes — they won't ring at the exact time.",
      steps: [
        "We'll open the 'Alarms & reminders' permission screen.",
        "Turn 'Allow setting alarms and reminders' ON for RoomMate.",
        "Come back to RoomMate when you're done.",
      ],
      buttonLabel: "Open Alarms & reminders",
      open: () => NativeAlarm.requestExactAlarmPermission(),
      isOk: (d) => d.exactAlarmGranted,
    },
    {
      key: "battery",
      title: "Disable battery optimization",
      why: "If RoomMate is battery-optimized, Android can kill it in deep sleep and your alarm won't ring.",
      steps: [
        "We'll show the battery-optimization prompt.",
        "Choose 'Allow' (or set RoomMate to 'Unrestricted' / 'Don't optimize').",
        "Come back to RoomMate when you're done.",
      ],
      buttonLabel: "Open Battery settings",
      open: () => NativeAlarm.requestDisableBatteryOptimization(),
      isOk: (d) => d.ignoringBatteryOptimization,
    },
    {
      key: "overlay",
      title: "Display over other apps",
      why: "Lets the full-screen alarm appear above the lock screen, just like the system clock.",
      steps: [
        "We'll open the 'Display over other apps' screen.",
        "Turn the toggle ON for RoomMate.",
        "Come back to RoomMate when you're done.",
      ],
      buttonLabel: "Open Overlay settings",
      open: () => NativeAlarm.openOverlaySettings(),
      isOk: (d) => d.canDrawOverlays,
    },
    {
      key: "autostart",
      title: "Enable Autostart (OEM)",
      why: "On Xiaomi/Oppo/Vivo/Realme/Huawei, autostart must be ON or the system blocks alarms when the app is closed.",
      steps: [
        "We'll try to open your phone's Autostart screen.",
        "Find RoomMate in the list and turn Autostart ON.",
        "If the screen doesn't open, follow the manufacturer tip shown below.",
        "Come back to RoomMate when you're done.",
      ],
      buttonLabel: "Open Autostart settings",
      open: () => NativeAlarm.openAutostartSettings(),
      isOk: () => true, // We can't verify autostart from app code; user confirms.
    },
  ];

  const startStep = (key: StepDef["key"]) => {
    const def = STEPS.find((s) => s.key === key);
    if (!def) return;
    setActiveStep(def);
    setStepPhase("instructions");
    setStepOpening(false);
  };

  const openStepSettings = async () => {
    if (!activeStep) return;
    setStepOpening(true);
    try {
      await activeStep.open();
      // If the OS doesn't background us (e.g. autostart fallback),
      // still let the user confirm manually.
    } catch {
      toast.error("Couldn't open that settings screen automatically.");
      setStepPhase("confirm");
      setStepOpening(false);
    }
  };

  const confirmStepDone = async () => {
    if (!activeStep) return;
    setStepRechecking(true);
    try {
      const d = await NativeAlarm.getDiagnostics();
      setDiag(d);
      const ok = activeStep.isOk(d);
      if (ok) {
        toast.success(`${activeStep.title} — done`);
        setActiveStep(null);
      } else {
        toast.warning("Still not enabled. Try the steps again.");
        setStepPhase("instructions");
      }
    } catch {
      toast.error("Couldn't re-check status. Try again.");
    } finally {
      setStepRechecking(false);
    }
  };

  const closeStep = () => {
    setActiveStep(null);
    setStepPhase("instructions");
    setStepOpening(false);
  };

  if (!isAndroid) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alarm Setup</DialogTitle>
            <DialogDescription>
              Native alarm hardening only applies to the installed Android app. Web/iOS use the system scheduler.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => { onOpenChange(false); onReady?.(); onComplete?.(); }}>Continue</Button>
        </DialogContent>
      </Dialog>
    );
  }

  // Success screen: shown after all checks pass within this session.
  if (successShown && criticalOk) {
    const hh = autoTestScheduled ? String(autoTestScheduled.hour).padStart(2, "0") : "--";
    const mm = autoTestScheduled ? String(autoTestScheduled.minute).padStart(2, "0") : "--";
    return (
      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) onComplete?.(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" /> You're all set!
            </DialogTitle>
            <DialogDescription>
              RoomMate alarms are configured to ring as reliably as your phone's built-in alarm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {autoTestScheduled && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm">
                <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                  ⏰ Test alarm scheduled for {hh}:{mm}
                </p>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-1">
                  Lock your phone & swipe RoomMate out of recents. It should ring within 2 minutes.
                </p>
              </div>
            )}
            <Button
              className="w-full"
              onClick={() => { onOpenChange(false); onReady?.(); onComplete?.(); }}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" /> Alarm Setup
          </DialogTitle>
          <DialogDescription>
            Make sure RoomMate alarms ring reliably — like your phone's built-in alarm.
          </DialogDescription>
        </DialogHeader>

        {loading && !diag ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : diag ? (
          <div className="space-y-4">
            {!criticalOk && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
                <p className="font-semibold text-amber-900 dark:text-amber-200">⚠ Some critical settings are off</p>
                <p className="text-amber-800 dark:text-amber-300/80 text-xs mt-1">
                  Tap each <strong>Fix now</strong> button below. Without these, alarms may be silenced or skipped by Android.
                </p>
              </div>
            )}

            <Card>
              <CardContent className="p-3">
                <StatusRow
                  icon={<BellRing className="h-5 w-5" />}
                  label="Notifications allowed"
                  ok={diag.notificationsEnabled}
                  onFix={() => startStep("notifications")}
                  hint="Required to show the alarm screen."
                />
                <StatusRow
                  icon={<Layers className="h-5 w-5" />}
                  label={`Alarm channel importance (${importanceLabel(diag.channelImportance)})`}
                  ok={diag.channelImportance >= 4}
                  onFix={() => startStep("channel")}
                  hint="Must be High/Urgent so it bypasses Do Not Disturb."
                />
                <StatusRow
                  icon={<Zap className="h-5 w-5" />}
                  label="Exact alarms permission"
                  ok={diag.exactAlarmGranted}
                  onFix={() => startStep("exact")}
                  hint="Lets RoomMate ring at the exact minute, not delayed."
                />
                <StatusRow
                  icon={<Battery className="h-5 w-5" />}
                  label="Battery: unrestricted"
                  ok={diag.ignoringBatteryOptimization}
                  onFix={() => startStep("battery")}
                  hint="Stops Android from killing the alarm in deep sleep."
                />
                <StatusRow
                  icon={<Smartphone className="h-5 w-5" />}
                  label="Display over other apps"
                  ok={diag.canDrawOverlays}
                  onFix={() => startStep("overlay")}
                  required={false}
                  hint="Helps the full-screen alarm appear above the lock screen."
                />
                <StatusRow
                  icon={<PlayCircle className="h-5 w-5" />}
                  label="Autostart (OEM)"
                  ok={false}
                  required={false}
                  fixLabel={diag.hasAutostartIntent ? "Open" : "How to"}
                  onFix={() => startStep("autostart")}
                  hint={tipFor(diag.manufacturer) ?? "On Xiaomi/Oppo/Vivo/Realme/Huawei: enable Autostart in system settings."}
                />
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" onClick={refresh} className="flex-1" disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Re-check
              </Button>
              <Button onClick={handleTest} className="flex-1" disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1" />}
                Run 2-min test
              </Button>
            </div>

            <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How to test correctly</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>Tap <strong>Run 2-min test</strong>.</li>
                <li>Press the power button to lock the screen.</li>
                <li>Swipe RoomMate out of recent apps.</li>
                <li>Wait 2 minutes — it should ring continuously, like the system alarm.</li>
              </ol>
            </div>

            <button
              type="button"
              onClick={() => setShowDebug(v => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Bug className="h-3 w-3" /> Debug info
              {showDebug ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showDebug && (
              <pre className="text-[10px] bg-muted/60 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all">
{JSON.stringify(diag, null, 2)}
              </pre>
            )}

            <Button
              className="w-full"
              variant={criticalOk ? "default" : "outline"}
              onClick={() => {
                onOpenChange(false);
                if (criticalOk) { onReady?.(); onComplete?.(); }
              }}
            >
              {criticalOk ? "All set — continue" : "Close (some checks still failing)"}
            </Button>
          </div>
        ) : null}

        {/* Per-step instruction & confirm dialog */}
        <Dialog open={!!activeStep} onOpenChange={(v) => { if (!v) closeStep(); }}>
          <DialogContent className="max-w-md">
            {activeStep && (
              <>
                <DialogHeader>
                  <DialogTitle>{activeStep.title}</DialogTitle>
                  <DialogDescription>{activeStep.why}</DialogDescription>
                </DialogHeader>

                {stepPhase === "instructions" ? (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-muted/40 p-3">
                      <p className="text-xs font-semibold text-foreground mb-2">What you'll do</p>
                      <ol className="list-decimal pl-4 space-y-1 text-sm text-muted-foreground">
                        {activeStep.steps.map((s, i) => (<li key={i}>{s}</li>))}
                      </ol>
                    </div>
                    {activeStep.key === "autostart" && diag && tipFor(diag.manufacturer) && (
                      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
                        <p className="font-semibold text-foreground mb-1">Tip for your phone ({diag.manufacturer})</p>
                        <p className="text-muted-foreground">{tipFor(diag.manufacturer)}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={closeStep} className="flex-1">Cancel</Button>
                      <Button onClick={openStepSettings} className="flex-1" disabled={stepOpening}>
                        {stepOpening ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-1" />}
                        {activeStep.buttonLabel}
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStepPhase("confirm")}
                      className="text-xs text-muted-foreground hover:text-foreground underline w-full text-center"
                    >
                      I've already enabled this →
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm">
                      <p className="font-semibold text-emerald-900 dark:text-emerald-200">Did you enable it?</p>
                      <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-1">
                        Tap "Yes, I enabled it" so we can verify the setting on your device.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setStepPhase("instructions")} className="flex-1">
                        Try again
                      </Button>
                      <Button onClick={confirmStepDone} className="flex-1" disabled={stepRechecking}>
                        {stepRechecking ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-1" />}
                        Yes, I enabled it
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

/** Lightweight banner for the Alarms page. */
export function AlarmSetupBanner({ onOpen }: { onOpen: () => void }) {
  const isAndroid = Capacitor.getPlatform() === "android";
  const [diag, setDiag] = useState<Diag | null>(null);
  const [dismissedLegacy, setDismissedLegacy] = useState<boolean>(() => {
    try { return localStorage.getItem("alarm_legacy_warning_dismissed_v2") === "1"; } catch { return false; }
  });

  const load = useCallback(async () => {
    if (!isAndroid) return;
    try { setDiag(await NativeAlarm.getDiagnostics()); } catch {}
  }, [isAndroid]);

  useEffect(() => {
    load();
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  if (!isAndroid || !diag) return null;

  const criticalOk =
    diag.notificationsEnabled &&
    diag.channelImportance >= 4 &&
    diag.exactAlarmGranted &&
    diag.ignoringBatteryOptimization;

  return (
    <div className="space-y-2">
      {!criticalOk && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-amber-900 dark:text-amber-200">Alarms may not ring reliably</p>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
              Finish the 1-minute alarm setup so RoomMate works like your built-in alarm.
            </p>
          </div>
          <Button size="sm" onClick={onOpen}>Set up</Button>
        </div>
      )}
      {!dismissedLegacy && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 flex items-start gap-3">
          <RefreshCw className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Update your alarms</p>
            <p className="text-xs text-muted-foreground">
              Alarms created before this update use the old engine. Delete and re-create them so they use the new reliable scheduler.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => {
            try { localStorage.setItem("alarm_legacy_warning_dismissed_v2", "1"); } catch {}
            setDismissedLegacy(true);
          }}>Got it</Button>
        </div>
      )}
    </div>
  );
}
