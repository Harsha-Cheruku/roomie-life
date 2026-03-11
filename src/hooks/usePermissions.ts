import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";

interface PermissionState {
  notifications: PermissionStatus | null;
  microphone: PermissionStatus | null;
  camera: PermissionStatus | null;
}

type PermissionStatus = "granted" | "denied" | "prompt" | "unsupported";

export const usePermissions = () => {
  const [permissions, setPermissions] = useState<PermissionState>({
    notifications: null,
    microphone: null,
    camera: null,
  });

  const checkPermission = useCallback(async (name: string): Promise<PermissionStatus> => {
    try {
      if (name === "notifications") {
        if (!("Notification" in window)) return "unsupported";
        return Notification.permission as PermissionStatus;
      }
      if ("permissions" in navigator) {
        const result = await navigator.permissions.query({ name: name as PermissionName });
        return result.state as PermissionStatus;
      }
      return "unsupported";
    } catch {
      return "unsupported";
    }
  }, []);

  const checkAllPermissions = useCallback(async () => {
    const [notifications, microphone, camera] = await Promise.all([
      checkPermission("notifications"),
      checkPermission("microphone"),
      checkPermission("camera"),
    ]);
    setPermissions({ notifications, microphone, camera });
  }, [checkPermission]);

  useEffect(() => {
    checkAllPermissions();
  }, [checkAllPermissions]);

  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (!("Notification" in window)) {
      toast.error("Notifications not supported on this device");
      return false;
    }
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") {
      toast.error("Notifications blocked. Enable them in browser settings.");
      return false;
    }
    try {
      const result = await Notification.requestPermission();
      setPermissions((p) => ({ ...p, notifications: result as PermissionStatus }));
      if (result === "granted") {
        toast.success("Notifications enabled!");
        return true;
      }
      toast.error("Notification permission denied");
      return false;
    } catch {
      toast.error("Failed to request notification permission");
      return false;
    }
  }, []);

  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setPermissions((p) => ({ ...p, microphone: "granted" }));
      return true;
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        toast.error("Microphone permission denied. Enable it in browser settings.");
        setPermissions((p) => ({ ...p, microphone: "denied" }));
      } else {
        toast.error("Microphone not available on this device");
        setPermissions((p) => ({ ...p, microphone: "unsupported" }));
      }
      return false;
    }
  }, []);

  const requestAllPermissions = useCallback(async () => {
    await requestNotificationPermission();
    // Only request microphone when actually needed, not upfront
    await checkAllPermissions();
  }, [requestNotificationPermission, checkAllPermissions]);

  return {
    permissions,
    requestNotificationPermission,
    requestMicrophonePermission,
    requestAllPermissions,
    checkAllPermissions,
  };
};
