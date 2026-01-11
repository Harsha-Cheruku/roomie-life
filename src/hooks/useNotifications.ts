import { useEffect, useRef, useCallback, useState } from "react";
import { toast } from "sonner";

interface CustomNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
  onClick?: () => void;
  route?: string; // Route to navigate to when clicked
}

// Notification sound URLs
const NOTIFICATION_SOUNDS = {
  alarm: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
  reminder: "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3",
  default: "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3",
};

export const useNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Check and request notification permission
    if ("Notification" in window) {
      setPermission(Notification.permission);
      
      // Auto-request permission if not decided
      if (Notification.permission === "default") {
        // Wait for user interaction before requesting
        const handleInteraction = () => {
          Notification.requestPermission().then((perm) => {
            setPermission(perm);
          });
          window.removeEventListener('click', handleInteraction);
        };
        window.addEventListener('click', handleInteraction, { once: true });
      }
    }
  }, []);

  const playNotificationSound = useCallback(async (type: 'alarm' | 'reminder' | 'default' = 'default') => {
    try {
      // Stop any currently playing sound
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const soundUrl = NOTIFICATION_SOUNDS[type];
      const audio = new Audio(soundUrl);
      audio.volume = type === 'alarm' ? 1.0 : 0.7;
      
      audioRef.current = audio;
      await audio.play();
      
      console.log(`Notification sound playing: ${type}`);
      return true;
    } catch (error) {
      console.warn("Failed to play notification sound:", error);
      
      // Fallback: Use Web Audio API for a simple beep
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = type === 'alarm' ? 880 : 440;
        oscillator.type = "sine";
        gainNode.gain.value = 0.3;
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
        
        // Clean up after sound finishes
        setTimeout(() => audioContext.close(), 500);
        return true;
      } catch (e) {
        console.warn("Web Audio API fallback also failed:", e);
        return false;
      }
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      toast.error("This browser doesn't support notifications");
      return false;
    }

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      
      if (perm === "granted") {
        toast.success("Notifications enabled!");
        return true;
      } else if (perm === "denied") {
        toast.error("Notifications blocked. Please enable in browser settings.");
        return false;
      }
      return false;
    } catch (error) {
      console.error("Error requesting permission:", error);
      return false;
    }
  }, []);

  const sendNotification = useCallback((options: CustomNotificationOptions) => {
    const { title, body, icon, tag, requireInteraction, silent, onClick, route } = options;

    // Always show in-app toast with click handler
    toast(title, {
      description: body,
      duration: requireInteraction ? 15000 : 5000,
      action: route ? {
        label: "View",
        onClick: () => {
          if (route) {
            window.location.href = route;
          }
          onClick?.();
        }
      } : undefined,
    });

    // Try to send browser notification for background/locked screen
    if ("Notification" in window && permission === "granted") {
      try {
        const notification = new Notification(title, {
          body,
          icon: icon || "/favicon.ico",
          tag,
          requireInteraction: requireInteraction ?? false,
          silent: silent ?? false,
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
          
          // Navigate to route if specified
          if (route) {
            window.location.href = route;
          }
          onClick?.();
        };

        // Auto close after 30 seconds if not required interaction
        if (!requireInteraction) {
          setTimeout(() => notification.close(), 30000);
        }

        return notification;
      } catch (error) {
        console.error("Failed to create notification:", error);
      }
    }

    return null;
  }, [permission]);

  const sendAlarmNotification = useCallback((title: string, alarmTime: string) => {
    // Play alarm sound first
    playNotificationSound('alarm');
    
    // Vibrate if supported
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([500, 200, 500, 200, 500]);
      } catch (e) {
        // Ignore
      }
    }
    
    return sendNotification({
      title: `🔔 Alarm: ${title}`,
      body: `It's ${alarmTime}! Wake up!`,
      requireInteraction: true,
      silent: false,
      tag: "alarm",
      route: "/alarms",
    });
  }, [sendNotification, playNotificationSound]);

  const sendReminderNotification = useCallback((title: string, description?: string) => {
    // Play reminder sound
    playNotificationSound('reminder');
    
    // Vibrate if supported
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch (e) {
        // Ignore
      }
    }
    
    return sendNotification({
      title: `⏰ Reminder: ${title}`,
      body: description || "You have a reminder!",
      requireInteraction: false,
      tag: "reminder",
      route: "/reminders",
    });
  }, [sendNotification, playNotificationSound]);

  const sendExpenseNotification = useCallback((title: string, amount: number, type: 'request' | 'accepted' | 'rejected' | 'settled') => {
    const messages = {
      request: `New expense request: ₹${amount.toLocaleString()}`,
      accepted: `Expense accepted: ₹${amount.toLocaleString()}`,
      rejected: `Expense rejected: ₹${amount.toLocaleString()}`,
      settled: `Payment settled: ₹${amount.toLocaleString()}`,
    };

    const icons = {
      request: "💰",
      accepted: "✅",
      rejected: "❌",
      settled: "🎉",
    };

    playNotificationSound('default');

    return sendNotification({
      title: `${icons[type]} ${title}`,
      body: messages[type],
      tag: "expense",
      route: "/expenses",
    });
  }, [sendNotification, playNotificationSound]);

  const sendTaskNotification = useCallback((title: string, action: 'assigned' | 'completed' | 'rejected') => {
    const messages = {
      assigned: `New task assigned: ${title}`,
      completed: `Task completed: ${title}`,
      rejected: `Task rejected: ${title}`,
    };

    const icons = {
      assigned: "📋",
      completed: "✅",
      rejected: "❌",
    };

    playNotificationSound('default');

    return sendNotification({
      title: `${icons[action]} Task Update`,
      body: messages[action],
      tag: "task",
      route: "/tasks",
    });
  }, [sendNotification, playNotificationSound]);

  return {
    permission,
    requestPermission,
    sendNotification,
    sendAlarmNotification,
    sendReminderNotification,
    sendExpenseNotification,
    sendTaskNotification,
    playNotificationSound,
    hasPermission: permission === "granted",
  };
};
