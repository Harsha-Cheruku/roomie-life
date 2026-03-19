import { useRef, useCallback, useEffect } from "react";

// Ringtone options mapped to sound files
const RINGTONE_MAP: Record<string, string> = {
  default: "/alarm_sound.wav",
  gentle: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
  loud: "https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3",
  beep: "beep", // Use Web Audio API beep pattern
};

const getAlarmSounds = (): string[] => {
  const preference = typeof localStorage !== 'undefined' ? localStorage.getItem('alarm_ringtone') : null;
  if (preference === 'beep') return []; // Will use beep pattern only
  const primary = RINGTONE_MAP[preference || 'default'] || "/alarm_sound.wav";
  // Put preferred sound first, then fallbacks
  return [primary, "/alarm_sound.wav", "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3"].filter(
    (v, i, a) => a.indexOf(v) === i // deduplicate
  );
};

// Create a beep pattern using Web Audio API as ultimate fallback
const createBeepSound = (audioContext: AudioContext, frequency: number = 880, duration: number = 0.3): OscillatorNode => {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = frequency;
  oscillator.type = "square"; // More alarming than sine
  
  gainNode.gain.value = 0.6;
  gainNode.gain.setValueAtTime(0.6, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
  
  return oscillator;
};

export const useAlarmSound = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const beepIntervalRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  const vibrationIntervalRef = useRef<number | null>(null);
  const cleanupCalledRef = useRef(false);

  const fullCleanup = useCallback(() => {
    if (cleanupCalledRef.current) return;
    cleanupCalledRef.current = true;
    
    isPlayingRef.current = false;

    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = '';
        audioRef.current = null;
      } catch (e) {
        console.warn("Error stopping audio:", e);
      }
    }

    if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
        audioContextRef.current = null;
      } catch (e) { /* ignore */ }
    }

    if (vibrationIntervalRef.current) {
      clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = null;
    }
    if ('vibrate' in navigator) {
      try { navigator.vibrate(0); } catch (e) { /* ignore */ }
    }
    
    setTimeout(() => { cleanupCalledRef.current = false; }, 100);
  }, []);

  useEffect(() => {
    return () => { fullCleanup(); };
  }, [fullCleanup]);

  const startVibration = useCallback(() => {
    if ('vibrate' in navigator) {
      const vibratePattern = () => {
        try { navigator.vibrate([500, 200, 500, 200, 500]); } catch (e) { /* ignore */ }
      };
      vibratePattern();
      vibrationIntervalRef.current = window.setInterval(vibratePattern, 2000);
    }
  }, []);

  const playBeepPattern = useCallback(() => {
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      let isHighTone = true;
      const playBeep = () => {
        if (!isPlayingRef.current || !audioContextRef.current || audioContextRef.current.state === 'closed') return;
        
        try {
          const frequency = isHighTone ? 880 : 660;
          isHighTone = !isHighTone;
          
          const oscillator = createBeepSound(audioContextRef.current, frequency, 0.25);
          oscillator.start();
          oscillator.stop(audioContextRef.current.currentTime + 0.25);
        } catch (e) {
          console.warn("Beep failed:", e);
        }
      };

      playBeep();
      beepIntervalRef.current = window.setInterval(playBeep, 400);
      
      console.log("Alarm: Playing beep pattern fallback");
    } catch (error) {
      console.error("Failed to create beep sound:", error);
    }
  }, []);

  const playAlarm = useCallback(async () => {
    if (isPlayingRef.current) {
      console.log("Alarm: Already playing, skipping");
      return;
    }
    isPlayingRef.current = true;
    console.log("Alarm: Starting playback...");

    // Start vibration immediately
    startVibration();

    // Also start beep pattern immediately as backup while audio loads
    playBeepPattern();

    // Try audio files in parallel with beep (beep ensures something plays immediately)
    for (const soundUrl of getAlarmSounds()) {
      try {
        const audio = new Audio(soundUrl);
        audio.loop = true;
        audio.volume = 1.0;

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('timeout')), 3000);
          audio.oncanplaythrough = () => { clearTimeout(timeout); resolve(); };
          audio.onerror = () => { clearTimeout(timeout); reject(new Error('load error')); };
          audio.load();
        });

        await audio.play();
        audioRef.current = audio;
        
        // Audio loaded successfully — stop the beep fallback
        if (beepIntervalRef.current) {
          clearInterval(beepIntervalRef.current);
          beepIntervalRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          try { audioContextRef.current.close(); audioContextRef.current = null; } catch (e) { /* ignore */ }
        }
        
        console.log("Alarm: Audio playing:", soundUrl);
        return;
      } catch (error) {
        console.warn("Alarm: Failed to load", soundUrl, error);
      }
    }

    // All audio files failed — beep pattern is already running as fallback
    console.log("Alarm: All audio files failed, beep pattern continues");
  }, [playBeepPattern, startVibration]);

  const stopAlarm = useCallback(() => {
    console.log("Alarm: Stopping");
    fullCleanup();
  }, [fullCleanup]);

  const setVolume = useCallback((volume: number) => {
    const v = Math.max(0, Math.min(1, volume));
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  const preloadAudio = useCallback(() => {
    try {
      const sounds = getAlarmSounds();
      if (sounds.length > 0) {
        const audio = new Audio(sounds[0]);
        audio.preload = 'auto';
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
