import { useRef, useCallback } from "react";

// Multiple fallback alarm sounds (public domain/free sounds)
const ALARM_SOUNDS = [
  "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
  "https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3",
  "https://assets.mixkit.co/active_storage/sfx/2868/2868-preview.mp3",
];

// Simple beep fallback using Web Audio API
const createFallbackBeep = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 880; // A5 note
    oscillator.type = "sine";
    gainNode.gain.value = 0.5;

    return { oscillator, gainNode, audioContext };
  } catch {
    return null;
  }
};

export const useAlarmSound = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const beepContextRef = useRef<{
    oscillator: OscillatorNode;
    gainNode: GainNode;
    audioContext: AudioContext;
  } | null>(null);
  const isPlayingRef = useRef(false);
  const beepIntervalRef = useRef<number | null>(null);

  const playBeepPattern = useCallback(() => {
    const beep = createFallbackBeep();
    if (!beep) return;

    beepContextRef.current = beep;
    let isOn = false;

    beepIntervalRef.current = window.setInterval(() => {
      if (isOn) {
        beep.gainNode.gain.value = 0;
        isOn = false;
      } else {
        beep.gainNode.gain.value = 0.5;
        isOn = true;
      }
    }, 500);

    beep.oscillator.start();
  }, []);

  const stopBeepPattern = useCallback(() => {
    if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }
    if (beepContextRef.current) {
      try {
        beepContextRef.current.oscillator.stop();
        beepContextRef.current.audioContext.close();
      } catch {
        // Ignore errors when stopping
      }
      beepContextRef.current = null;
    }
  }, []);

  const playAlarm = useCallback(async () => {
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;

    // Try each sound URL in order
    for (const soundUrl of ALARM_SOUNDS) {
      try {
        const audio = new Audio(soundUrl);
        audio.loop = true;
        audio.volume = 1.0;

        await audio.play();
        audioRef.current = audio;
        console.log("Alarm sound playing:", soundUrl);
        return; // Success, exit loop
      } catch (error) {
        console.warn("Failed to play alarm sound:", soundUrl, error);
      }
    }

    // All audio files failed, use Web Audio API beep fallback
    console.log("Using fallback beep sound");
    playBeepPattern();
  }, [playBeepPattern]);

  const stopAlarm = useCallback(() => {
    isPlayingRef.current = false;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    stopBeepPattern();
  }, [stopBeepPattern]);

  const setVolume = useCallback((volume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
    }
    if (beepContextRef.current) {
      beepContextRef.current.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }, []);

  return {
    playAlarm,
    stopAlarm,
    setVolume,
    isPlaying: isPlayingRef.current,
  };
};
