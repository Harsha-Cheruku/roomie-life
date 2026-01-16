import { useRef, useCallback, useEffect } from "react";

// Multiple fallback alarm sounds (public domain/free sounds)
const ALARM_SOUNDS = [
  "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
  "https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3",
  "https://assets.mixkit.co/active_storage/sfx/2868/2868-preview.mp3",
  // Additional fallbacks
  "https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3",
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
  const vibrationIntervalRef = useRef<number | null>(null);
  const cleanupCalledRef = useRef(false);

  // Full cleanup function
  const fullCleanup = useCallback(() => {
    if (cleanupCalledRef.current) return;
    cleanupCalledRef.current = true;
    
    console.log("Alarm: Full cleanup called");
    isPlayingRef.current = false;

    // Stop audio element
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = '';
        audioRef.current = null;
      } catch (e) {
        console.warn("Error stopping audio element:", e);
      }
    }

    // Stop beep interval
    if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
        audioContextRef.current = null;
      } catch (e) {
        console.warn("Error closing audio context:", e);
      }
    }

    // Stop vibration
    if (vibrationIntervalRef.current) {
      clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = null;
    }
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch (e) {
        // Ignore
      }
    }
    
    // Reset cleanup flag after a delay
    setTimeout(() => {
      cleanupCalledRef.current = false;
    }, 100);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      fullCleanup();
    };
  }, [fullCleanup]);

  const startVibration = useCallback(() => {
    // Vibration API for mobile devices
    if ('vibrate' in navigator) {
      // Create a vibration pattern: vibrate 500ms, pause 200ms, repeat
      const vibratePattern = () => {
        try {
          navigator.vibrate([500, 200, 500, 200, 500]);
        } catch (e) {
          console.warn("Vibration failed:", e);
        }
      };
      
      vibratePattern();
      vibrationIntervalRef.current = window.setInterval(vibratePattern, 2000);
    }
  }, []);

  const stopVibration = useCallback(() => {
    if (vibrationIntervalRef.current) {
      clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = null;
    }
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(0); // Stop vibration
      } catch (e) {
        // Ignore
      }
    }
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

      // Create a repeating beep pattern with alternating tones
      let isHighTone = true;
      const playBeep = () => {
        if (!isPlayingRef.current || !audioContextRef.current) return;
        
        const frequency = isHighTone ? 880 : 660;
        isHighTone = !isHighTone;
        
        const oscillator = createBeepSound(audioContextRef.current, frequency, 0.25);
        oscillator.start();
        oscillator.stop(audioContextRef.current.currentTime + 0.25);
      };

      // Play immediately and then every 400ms for urgent alarm feel
      playBeep();
      beepIntervalRef.current = window.setInterval(playBeep, 400);
      
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
    if (isPlayingRef.current) {
      console.log("Alarm: Already playing, skipping");
      return;
    }
    isPlayingRef.current = true;

    console.log("Alarm: Attempting to play sound...");

    // Start vibration on mobile
    startVibration();

    // Try each sound URL in sequence
    for (const soundUrl of ALARM_SOUNDS) {
      try {
        const audio = new Audio(soundUrl);
        audio.loop = true;
        audio.volume = 1.0;
        audio.preload = 'auto';
        
        // Set up cross-origin handling
        audio.crossOrigin = "anonymous";

        // Wait for the audio to be ready with a shorter timeout
        await new Promise<void>((resolve, reject) => {
          const loadTimeout = setTimeout(() => reject(new Error('Load timeout')), 2000);
          
          audio.oncanplaythrough = () => {
            clearTimeout(loadTimeout);
            resolve();
          };
          
          audio.onerror = () => {
            clearTimeout(loadTimeout);
            reject(new Error('Load failed'));
          };

          // Start loading
          audio.load();
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
  }, [playBeepPattern, startVibration]);

  const stopAlarm = useCallback(() => {
    console.log("Alarm: Stopping sound");
    fullCleanup();
  }, [fullCleanup]);

  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    if (audioRef.current) {
      audioRef.current.volume = clampedVolume;
    }
  }, []);

  // Preload audio for faster playback
  const preloadAudio = useCallback(() => {
    const audio = new Audio(ALARM_SOUNDS[0]);
    audio.preload = 'auto';
    audio.load();
  }, []);

  return {
    playAlarm,
    stopAlarm,
    setVolume,
    preloadAudio,
    isPlaying: isPlayingRef.current,
  };
};
