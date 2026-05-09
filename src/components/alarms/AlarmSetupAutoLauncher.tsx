import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import NativeAlarm from "@/plugins/NativeAlarmPlugin";
import { AlarmSetupWizard } from "./AlarmSetupWizard";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Bump this whenever the wizard's required-checks change so users see the
 * setup again after an app update.
 */
const SETUP_VERSION = "v3";
const COMPLETE_KEY = `alarm_setup_completed_${SETUP_VERSION}`;
const PROMPTED_KEY = `alarm_setup_prompted_${SETUP_VERSION}`;

/**
 * On Android, opens the Alarm Setup Wizard automatically:
 *  - on first launch after install
 *  - after an app update that bumps SETUP_VERSION
 *  - whenever critical alarm settings are missing and we haven't yet auto-prompted this version
 *
 * Also triggers an immediate notification permission request (where supported)
 * so users land on a familiar OS prompt before the wizard appears.
 */
export function AlarmSetupAutoLauncher() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (Capacitor.getPlatform() !== "android") return;

    let cancelled = false;
    const completed = (() => {
      try { return localStorage.getItem(COMPLETE_KEY) === "1"; } catch { return false; }
    })();
    const promptedThisVersion = (() => {
      try { return localStorage.getItem(PROMPTED_KEY) === "1"; } catch { return false; }
    })();

    const run = async () => {
      // Request browser-level notification permission immediately where supported.
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          await Notification.requestPermission();
        }
      } catch { /* non-fatal */ }

      try {
        const d = await NativeAlarm.getDiagnostics();
        if (cancelled) return;

        const criticalOk =
          d.notificationsEnabled &&
          d.channelImportance >= 4 &&
          d.exactAlarmGranted &&
          d.ignoringBatteryOptimization;

        if (criticalOk) {
          try { localStorage.setItem(COMPLETE_KEY, "1"); } catch {}
          return;
        }

        // Open the wizard if this is a fresh install / new version,
        // OR if checks are still failing and we haven't yet prompted this version.
        if (!completed || !promptedThisVersion) {
          try { localStorage.setItem(PROMPTED_KEY, "1"); } catch {}
          setOpen(true);
        }
      } catch {
        // If diagnostics fail (older native build), fall back to prompting once.
        if (!promptedThisVersion) {
          try { localStorage.setItem(PROMPTED_KEY, "1"); } catch {}
          setOpen(true);
        }
      }
    };

    // Slight delay so the app finishes hydrating before the dialog appears.
    const t = setTimeout(run, 1200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [user]);

  const handleComplete = () => {
    try { localStorage.setItem(COMPLETE_KEY, "1"); } catch {}
  };

  if (Capacitor.getPlatform() !== "android") return null;

  return (
    <AlarmSetupWizard
      open={open}
      onOpenChange={setOpen}
      onComplete={handleComplete}
      showSuccessScreen
    />
  );
}
