import { useEffect, useRef, useCallback } from "react";
import { ActiveAlarmModal } from "@/components/alarms/ActiveAlarmModal";
import { useGlobalAlarm } from "@/hooks/useGlobalAlarm";

/**
 * App-wide alarm layer. Keeps alarm ringing and modal active
 * regardless of current route/page.
 * 
 * Preloads audio on user interaction to bypass autoplay restrictions.
 * Retries sound playback on every user interaction while alarm is active.
 */
export function GlobalAlarmLayer() {
  const { activeTrigger, activeAlarm, handleDismissed, retryPlayAlarm } = useGlobalAlarm();
  const audioUnlockedRef = useRef(false);

  // Unlock Web Audio + retry alarm sound on every user interaction
  const handleInteraction = useCallback(() => {
    if (!audioUnlockedRef.current) {
      audioUnlockedRef.current = true;
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        console.log("Audio unlocked via user interaction");
      } catch (e) {
        console.warn("Audio unlock failed:", e);
      }
    }
    // If alarm is active, retry playing sound (in case autoplay was blocked)
    retryPlayAlarm();
  }, [retryPlayAlarm]);

  useEffect(() => {
    const events = ["click", "touchstart", "keydown"];
    events.forEach((e) => document.addEventListener(e, handleInteraction, { passive: true }));
    return () => {
      events.forEach((e) => document.removeEventListener(e, handleInteraction));
    };
  }, [handleInteraction]);

  if (!activeTrigger || !activeAlarm) return null;

  return (
    <ActiveAlarmModal
      trigger={activeTrigger}
      alarm={activeAlarm}
      onDismissed={handleDismissed}
    />
  );
}
