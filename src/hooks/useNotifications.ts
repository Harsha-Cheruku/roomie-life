import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";

interface CustomNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
}

export const useNotifications = () => {
  const permissionRef = useRef<NotificationPermission>("default");

  useEffect(() => {
    // Check and request notification permission
    if ("Notification" in window) {
      permissionRef.current = Notification.permission;
      
      if (Notification.permission === "default") {
        Notification.requestPermission().then((permission) => {
          permissionRef.current = permission;
        });
      }
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      toast.error("This browser doesn't support notifications");
      return false;
    }

    const permission = await Notification.requestPermission();
    permissionRef.current = permission;
    return permission === "granted";
  }, []);

  const sendNotification = useCallback((options: CustomNotificationOptions) => {
    const { title, body, icon, tag, requireInteraction, silent } = options;

    // Always show in-app toast
    toast(title, {
      description: body,
      duration: requireInteraction ? 10000 : 5000,
    });

    // Try to send browser notification for background/locked screen
    if ("Notification" in window && permissionRef.current === "granted") {
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
  }, []);

  const sendAlarmNotification = useCallback((title: string, alarmTime: string) => {
    return sendNotification({
      title: `🔔 Alarm: ${title}`,
      body: `It's ${alarmTime}! Wake up!`,
      requireInteraction: true,
      silent: false,
      tag: "alarm",
    });
  }, [sendNotification]);

  const sendReminderNotification = useCallback((title: string, description?: string) => {
    return sendNotification({
      title: `⏰ Reminder: ${title}`,
      body: description || "You have a reminder!",
      requireInteraction: false,
      tag: "reminder",
    });
  }, [sendNotification]);

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

    return sendNotification({
      title: `${icons[type]} ${title}`,
      body: messages[type],
      tag: "expense",
    });
  }, [sendNotification]);

  return {
    requestPermission,
    sendNotification,
    sendAlarmNotification,
    sendReminderNotification,
    sendExpenseNotification,
    hasPermission: permissionRef.current === "granted",
  };
};
