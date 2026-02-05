import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { useAlarmSound } from "@/hooks/useAlarmSound";
import { useNotifications } from "@/hooks/useNotifications";
import { useDeviceId } from "@/hooks/useDeviceId";

interface AlarmTrigger {
  id: string;
  alarm_id: string;
  ring_count: number;
  status: string;
  dismissed_by: string | null;
  triggered_at: string;
}

interface Alarm {
  id: string;
  title: string;
  alarm_time: string;
  condition_type: string;
  condition_value: number;
  created_by: string;
  owner_device_id?: string | null;
}

interface ActiveAlarmModalProps {
  trigger: AlarmTrigger;
  alarm: Alarm;
  userId: string | undefined;
  onDismissed: () => void;
}

/**
 * Alarm behavior (authoritative):
 * - Alarm sound + vibration is allowed ONLY on the alarm owner's original device.
 * - Everyone can dismiss; dismissal stops the alarm on all devices via realtime sync.
 * - Owner device auto-stops after exactly 3 rings (local timer; does not rely on backend latency).
 */
export function ActiveAlarmModal({ trigger, alarm, userId, onDismissed }: ActiveAlarmModalProps) {
  const RING_LENGTH_MS = 5000;
  const MAX_RINGS = 3;

  const deviceId = useDeviceId();
  const triggeredAtMs = useMemo(() => new Date(trigger.triggered_at).getTime(), [trigger.triggered_at]);

  const ringUiIntervalRef = useRef<number | null>(null);
  const ownerRingIntervalRef = useRef<number | null>(null);
  const localRingCounterRef = useRef(0);
  const hasStartedRef = useRef(false);
  const isMountedRef = useRef(true);
  const hasClosedRef = useRef(false);

  const [ringCount, setRingCount] = useState<number>(() => {
    const diff = Date.now() - triggeredAtMs;
    return Math.max(1, Math.floor(diff / RING_LENGTH_MS) + 1);
  });
  const [dismissing, setDismissing] = useState(false);

  const { playAlarm, stopAlarm } = useAlarmSound();
  const { sendNotification } = useNotifications();

  const isOwnerDevice = Boolean(
    userId &&
      userId === alarm.created_by &&
      alarm.owner_device_id &&
      alarm.owner_device_id === deviceId
  );

  const formatTime = useCallback((time: string) => {
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  }, []);

  const cleanupAlarm = useCallback(() => {
    if (ringUiIntervalRef.current) {
      clearInterval(ringUiIntervalRef.current);
      ringUiIntervalRef.current = null;
    }
    if (ownerRingIntervalRef.current) {
      clearInterval(ownerRingIntervalRef.current);
      ownerRingIntervalRef.current = null;
    }
    stopAlarm();
  }, [stopAlarm]);

  const updateTriggerDismissed = useCallback(
    async (dismissedBy: string | null) => {
      await supabase
        .from('alarm_triggers')
        .update({
          status: 'dismissed',
          dismissed_by: dismissedBy,
          dismissed_at: new Date().toISOString(),
        })
        .eq('id', trigger.id)
        .eq('status', 'ringing');
    },
    [trigger.id]
  );

  const handleAutoDismiss = useCallback(async () => {
    if (!userId || !isOwnerDevice || dismissing) return;
    cleanupAlarm();
    try {
      await updateTriggerDismissed(userId);
      hasClosedRef.current = true;
      onDismissed();
    } catch (err) {
      console.error('Error auto-dismissing alarm:', err);
    }
  }, [userId, isOwnerDevice, dismissing, cleanupAlarm, updateTriggerDismissed, onDismissed]);

  // Subscribe to trigger status changes for cross-device dismiss sync
  useEffect(() => {
    const statusChannel = supabase
      .channel(`trigger-status-${trigger.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'alarm_triggers',
        filter: `id=eq.${trigger.id}`
      }, (payload) => {
        // If trigger was dismissed by anyone, stop the alarm immediately
        if (payload.new.status === 'dismissed') {
          if (hasClosedRef.current) return;
          hasClosedRef.current = true;
          cleanupAlarm();
          onDismissed();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(statusChannel);
    };
  }, [trigger.id, cleanupAlarm, onDismissed]);

  useEffect(() => {
    isMountedRef.current = true;
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    // UI ring counter (shared) is derived from triggered_at.
    ringUiIntervalRef.current = window.setInterval(() => {
      if (!isMountedRef.current) return;
      const newRingCount = Math.max(1, Math.floor((Date.now() - triggeredAtMs) / RING_LENGTH_MS) + 1);
      setRingCount(newRingCount);
    }, 1000);

    if (isOwnerDevice) {
      // Start alarm sound + vibration ONLY on the owner device.
      void playAlarm().catch((error) => console.error('Failed to start alarm sound:', error));

      // Owner-only local ring timer (does not rely on backend latency).
      localRingCounterRef.current = 0;
      ownerRingIntervalRef.current = window.setInterval(() => {
        localRingCounterRef.current += 1;
        if (localRingCounterRef.current >= MAX_RINGS) {
          if (ownerRingIntervalRef.current) {
            clearInterval(ownerRingIntervalRef.current);
            ownerRingIntervalRef.current = null;
          }
          void handleAutoDismiss();
        }
      }, RING_LENGTH_MS);

      // Background/locked-screen notification (may play system notification sound).
      sendNotification({
        title: `Alarm: ${alarm.title}`,
        body: `It's ${formatTime(alarm.alarm_time)}. Tap to open.`,
        requireInteraction: true,
        silent: false,
        tag: `alarm-${trigger.id}`,
        route: "/alarms",
      });
    } else {
      // Non-owner devices: notification only, strictly silent.
      sendNotification({
        title: `Alarm: ${alarm.title}`,
        body: `${formatTime(alarm.alarm_time)} - A roommate's alarm is ringing. You can dismiss it.`,
        requireInteraction: true,
        silent: true,
        tag: `alarm-silent-${trigger.id}`,
        route: "/alarms",
      });
    }

    return () => {
      isMountedRef.current = false;
      cleanupAlarm();
    };
  }, [
    alarm.title,
    alarm.alarm_time,
    cleanupAlarm,
    formatTime,
    handleAutoDismiss,
    isOwnerDevice,
    playAlarm,
    sendNotification,
    trigger.id,
    triggeredAtMs,
  ]);

  const handleDismiss = async () => {
    if (!userId || dismissing) return;

    setDismissing(true);
    
    // IMMEDIATELY stop everything before any async operation
    cleanupAlarm();

    try {
      await updateTriggerDismissed(userId);

      toast.success('Alarm dismissed!');
      hasClosedRef.current = true;
      onDismissed();
    } catch (err) {
      console.error('Error dismissing alarm:', err);
      toast.error('Failed to dismiss alarm');
      setDismissing(false);
    }
  };

  return (
    <Dialog open={true}>
      <DialogContent className="sm:max-w-md bg-destructive/10 border-destructive" hideCloseButton>
        <div className="text-center space-y-6 py-4">
          <div className={isOwnerDevice ? "animate-pulse" : ""}>
            {isOwnerDevice ? (
              <Bell className="h-16 w-16 mx-auto text-destructive" />
            ) : (
              <VolumeX className="h-16 w-16 mx-auto text-muted-foreground" />
            )}
          </div>

          {!isOwnerDevice && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              Silent mode - A roommate's alarm is ringing on their device
            </p>
          )}

          <div>
            <h2 className="text-4xl font-bold">{formatTime(alarm.alarm_time)}</h2>
            <p className="text-lg mt-2">{alarm.title}</p>
          </div>

          <div className="flex items-center justify-center gap-4">
            <Badge variant="outline" className="flex items-center gap-1">
              <Volume2 className="h-3 w-3" />
              Ring #{ringCount}
            </Badge>
          </div>

          <Button
            onClick={handleDismiss}
            disabled={dismissing}
            className="w-full"
            size="lg"
          >
            <BellOff className="h-5 w-5 mr-2" />
            {dismissing ? 'Dismissing...' : 'Dismiss Alarm'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
