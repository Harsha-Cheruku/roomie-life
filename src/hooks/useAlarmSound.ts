import { useRef, useCallback, useEffect } from "react";

const RINGTONE_MAP: Record<string, string> = {
  default: "/alarm_sound.wav",
  gentle: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
  loud: "https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3",
  beep: "beep",
};

const getAlarmSounds = (): string[] => {
  const preference = typeof localStorage !== "undefined" ? localStorage.getItem("alarm_ringtone") : null;
  if (preference === "beep") return [];
  const primary = RINGTONE_MAP[preference || "default"] || "/alarm_sound.wav";
  return [primary, "/alarm_sound.wav", "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3"].filter(
    (v, i, a) => a.indexOf(v) === i
  );
};

export const useAlarmSound = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const beepIntervalRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  const vibrationIntervalRef = useRef<number | null>(null);
  const volumeRampRef = useRef<number | null>(null);

  const stopAllSound = useCallback(() => {
    isPlayingRef.current = false;

    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
        audioRef.current = null;
      } catch (e) { /* ignore */ }
    }

    if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try { audioContextRef.current.close(); } catch (e) { /* ignore */ }
      audioContextRef.current = null;
    }

    if (vibrationIntervalRef.current) {
      clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = null;
    }

    if (volumeRampRef.current) {
      clearInterval(volumeRampRef.current);
      volumeRampRef.current = null;
    }

    if ("vibrate" in navigator) {
      try { navigator.vibrate(0); } catch (e) { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    return () => { stopAllSound(); };
  }, [stopAllSound]);

  const startVibration = useCallback(() => {
    if ("vibrate" in navigator) {
      const vibratePattern = () => {
        try { navigator.vibrate([800, 200, 800, 200, 800]); } catch (e) { /* ignore */ }
      };
      vibratePattern();
      vibrationIntervalRef.current = window.setInterval(vibratePattern, 1500);
    }
  }, []);

  const startVolumeRamp = useCallback(() => {
    if (volumeRampRef.current) clearInterval(volumeRampRef.current);
    const startTime = Date.now();
    const RAMP_DURATION = 30000; // 30 seconds to full volume
    const MIN_VOL = 0.3;
    const MAX_VOL = 1.0;

    volumeRampRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / RAMP_DURATION, 1);
      const vol = MIN_VOL + (MAX_VOL - MIN_VOL) * progress;
      if (audioRef.current) audioRef.current.volume = vol;
      if (progress >= 1 && volumeRampRef.current) {
        clearInterval(volumeRampRef.current);
        volumeRampRef.current = null;
      }
    }, 500);
  }, []);

  const playBeepPattern = useCallback(() => {
    try {
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") ctx.resume();

      let isHighTone = true;
      const playBeep = () => {
        if (!isPlayingRef.current || !audioContextRef.current || audioContextRef.current.state === "closed") return;
        try {
          const frequency = isHighTone ? 880 : 660;
          isHighTone = !isHighTone;
          const oscillator = audioContextRef.current.createOscillator();
          const gainNode = audioContextRef.current.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioContextRef.current.destination);
          oscillator.frequency.value = frequency;
          oscillator.type = "square";
          gainNode.gain.value = 0.5;
          gainNode.gain.setValueAtTime(0.5, audioContextRef.current.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + 0.25);
          oscillator.start();
          oscillator.stop(audioContextRef.current.currentTime + 0.25);
        } catch (e) { /* ignore */ }
      };

      playBeep();
      beepIntervalRef.current = window.setInterval(playBeep, 400);
    } catch (error) {
      console.error("Failed to create beep sound:", error);
    }
  }, []);

  const playAlarm = useCallback(async () => {
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;
    console.log("Alarm: Starting continuous playback...");

    startVibration();
    playBeepPattern();

    const sounds = getAlarmSounds();
    for (const soundUrl of sounds) {
      if (!isPlayingRef.current) return;
      try {
        const audio = new Audio(soundUrl);
        audio.loop = true;
        audio.volume = 0.3; // Start low for volume ramp

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("timeout")), 4000);
          audio.oncanplaythrough = () => { clearTimeout(timeout); resolve(); };
          audio.onerror = () => { clearTimeout(timeout); reject(new Error("load error")); };
          audio.load();
        });

        if (!isPlayingRef.current) { audio.pause(); return; }

        await audio.play();
        audioRef.current = audio;

        // Audio loaded — stop beep but keep vibration
        if (beepIntervalRef.current) {
          clearInterval(beepIntervalRef.current);
          beepIntervalRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
          try { audioContextRef.current.close(); audioContextRef.current = null; } catch (e) { /* ignore */ }
        }

        // Start volume ramp from 0.3 → 1.0 over 30s
        startVolumeRamp();

        // Auto-restart if audio errors or ends unexpectedly
        audio.onerror = () => {
          if (isPlayingRef.current) {
            console.warn("Alarm: Audio errored, restarting beep fallback");
            playBeepPattern();
          }
        };
        audio.onended = () => {
          // loop=true should prevent this, but just in case
          if (isPlayingRef.current && audio.loop) {
            audio.currentTime = 0;
            audio.play().catch(() => {
              if (isPlayingRef.current) playBeepPattern();
            });
          }
        };

        console.log("Alarm: Audio playing continuously:", soundUrl);
        return;
      } catch (error) {
        console.warn("Alarm: Failed to load", soundUrl, error);
      }
    }

    // All audio files failed — beep continues as fallback
    console.log("Alarm: All audio files failed, beep pattern continues indefinitely");
  }, [playBeepPattern, startVibration, startVolumeRamp]);

  const stopAlarm = useCallback(() => {
    console.log("Alarm: Stopping immediately");
    stopAllSound();
  }, [stopAllSound]);

  const setVolume = useCallback((volume: number) => {
    const v = Math.max(0, Math.min(1, volume));
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  const preloadAudio = useCallback(() => {
    try {
      const sounds = getAlarmSounds();
      if (sounds.length > 0) {
        const audio = new Audio(sounds[0]);
        audio.preload = "auto";
        audio.load();
      }
    } catch (e) { /* ignore */ }
  }, []);

  return {
    playAlarm,
    stopAlarm,
    setVolume,
    preloadAudio,
    isPlaying: isPlayingRef.current,
  };
};
