import { useEffect, useRef } from "react";
import { ActiveAlarmModal } from "@/components/alarms/ActiveAlarmModal";
import { useGlobalAlarm } from "@/hooks/useGlobalAlarm";

/**
 * App-wide alarm layer. Keeps alarm ringing and modal active
 * regardless of current route/page.
 * 
 * Also preloads audio on user interaction to bypass autoplay restrictions.
 */
export function GlobalAlarmLayer() {
  const { activeTrigger, activeAlarm, handleDismissed } = useGlobalAlarm();
  const audioUnlockedRef = useRef(false);

  // Unlock Web Audio on first user interaction (required by Chrome/Safari autoplay policy)
  useEffect(() => {
    const unlockAudio = () => {
      if (audioUnlockedRef.current) return;
      audioUnlockedRef.current = true;

      // Create and immediately play a silent audio context to unlock audio playback
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        // Don't close - keep context alive for future use
        console.log("Audio unlocked via user interaction");
      } catch (e) {
        console.warn("Audio unlock failed:", e);
      }
    };

    const events = ["click", "touchstart", "keydown"];
    events.forEach((e) => document.addEventListener(e, unlockAudio, { once: false, passive: true }));

    return () => {
      events.forEach((e) => document.removeEventListener(e, unlockAudio));
    };
  }, []);

  if (!activeTrigger || !activeAlarm) return null;

  return (
    <ActiveAlarmModal
      trigger={activeTrigger}
      alarm={activeAlarm}
      onDismissed={handleDismissed}
    />
  );
}
