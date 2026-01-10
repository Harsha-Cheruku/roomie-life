import { useRef, useCallback, useEffect } from "react";

// Multiple fallback alarm sounds (public domain/free sounds)
const ALARM_SOUNDS = [
  "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
  "https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3",
  "https://assets.mixkit.co/active_storage/sfx/2868/2868-preview.mp3",
];

// Create a beep pattern using Web Audio API as ultimate fallback
const createBeepSound = (audioContext: AudioContext, frequency: number = 880, duration: number = 0.3): OscillatorNode => {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  
  gainNode.gain.value = 0.5;
  gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
  
  return oscillator;
};

export const useAlarmSound = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const beepIntervalRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAlarm();
    };
  }, []);

  const playBeepPattern = useCallback(() => {
    try {
      // Initialize audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      
      // Resume context if suspended (required for autoplay policies)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Create a repeating beep pattern
      const playBeep = () => {
        if (!isPlayingRef.current || !audioContextRef.current) return;
        
        const oscillator = createBeepSound(audioContextRef.current, 880, 0.3);
        oscillator.start();
        oscillator.stop(audioContextRef.current.currentTime + 0.3);
      };

      // Play immediately and then every 500ms
      playBeep();
      beepIntervalRef.current = window.setInterval(playBeep, 500);
      
      console.log("Alarm: Playing fallback beep pattern");
    } catch (error) {
      console.error("Failed to create beep sound:", error);
    }
  }, []);

  const stopBeepPattern = useCallback(() => {
    if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
        audioContextRef.current = null;
      } catch (e) {
        // Ignore close errors
      }
    }
  }, []);

  const playAlarm = useCallback(async () => {
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;

    console.log("Alarm: Attempting to play sound...");

    // Try each sound URL in sequence
    for (const soundUrl of ALARM_SOUNDS) {
      try {
        const audio = new Audio(soundUrl);
        audio.loop = true;
        audio.volume = 1.0;
        audio.preload = 'auto';

        // Set up event handlers before playing
        audio.onerror = () => {
          console.warn("Failed to load alarm sound:", soundUrl);
        };

        // Wait for the audio to be ready
        await new Promise<void>((resolve, reject) => {
          audio.oncanplaythrough = () => resolve();
          audio.onerror = () => reject(new Error('Load failed'));
          
          // Timeout after 3 seconds
          setTimeout(() => reject(new Error('Load timeout')), 3000);
        });

        await audio.play();
        audioRef.current = audio;
        console.log("Alarm: Sound playing successfully:", soundUrl);
        return; // Success!
      } catch (error) {
        console.warn("Failed to play alarm sound:", soundUrl, error);
        // Continue to next sound
      }
    }

    // All audio files failed, use Web Audio API beep fallback
    console.log("Alarm: All audio files failed, using beep fallback");
    playBeepPattern();
  }, [playBeepPattern]);

  const stopAlarm = useCallback(() => {
    console.log("Alarm: Stopping sound");
    isPlayingRef.current = false;

    // Stop audio element if playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = ''; // Release the resource
      audioRef.current = null;
    }

    // Stop beep pattern
    stopBeepPattern();
  }, [stopBeepPattern]);

  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    if (audioRef.current) {
      audioRef.current.volume = clampedVolume;
    }
  }, []);

  return {
    playAlarm,
    stopAlarm,
    setVolume,
    isPlaying: isPlayingRef.current,
  };
};
