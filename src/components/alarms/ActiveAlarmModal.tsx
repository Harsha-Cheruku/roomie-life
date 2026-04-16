import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Bell, BellOff, Volume2, VolumeX, Volume1 } from "lucide-react";
import { toast } from "sonner";
import { useDeviceId } from "@/hooks/useDeviceId";
import { useAuth } from "@/contexts/AuthContext";
import { useAlarmSound } from "@/hooks/useAlarmSound";
import { useNativeAlarm } from "@/hooks/useNativeAlarm";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

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
  room_id: string;
  owner_device_id?: string | null;
}

interface ActiveAlarmModalProps {
  trigger: AlarmTrigger;
  alarm: Alarm;
  onDismissed: () => void;
}

export function ActiveAlarmModal({ trigger, alarm, onDismissed }: ActiveAlarmModalProps) {
  const RING_LENGTH_MS = 5000;
  const { user } = useAuth();
  const userId = user?.id;
  const deviceId = useDeviceId();
  const { stopAlarm: stopWebAlarm, setVolume } = useAlarmSound();
  const { isNative, stopAlarm: stopNativeAlarm } = useNativeAlarm();
  const triggeredAtMs = useMemo(() => new Date(trigger.triggered_at).getTime(), [trigger.triggered_at]);
  const [alarmVolume, setAlarmVolume] = useState(100);

  const [ringCount, setRingCount] = useState<number>(() => {
    const diff = Date.now() - triggeredAtMs;
    return Math.max(1, Math.floor(diff / RING_LENGTH_MS) + 1);
  });
  const [dismissing, setDismissing] = useState(false);
  const [soundUnlocked, setSoundUnlocked] = useState(false);
  const hasClosedRef = useRef(false);

  const isOwnerDevice = Boolean(
    userId &&
      userId === alarm.created_by &&
      (!alarm.owner_device_id || alarm.owner_device_id === deviceId)
  );

  const isOwnerUser = userId === alarm.created_by;

  const canUserDismiss = useMemo(() => {
    if (isOwnerUser) return true;
    switch (alarm.condition_type) {
      case "owner_only":
        return false;
      case "after_rings":
        return ringCount >= (alarm.condition_value || 3);
      case "anyone_can_dismiss":
      default:
        return true;
    }
  }, [isOwnerUser, alarm.condition_type, alarm.condition_value, ringCount]);

  const formatTime = useCallback((time: string) => {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const newRingCount = Math.max(1, Math.floor((Date.now() - triggeredAtMs) / RING_LENGTH_MS) + 1);
      setRingCount(newRingCount);
    }, 1000);
    return () => clearInterval(interval);
  }, [triggeredAtMs]);

  useEffect(() => {
    const channel = supabase
      .channel(`trigger-status-${trigger.id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "alarm_triggers",
        filter: `id=eq.${trigger.id}`,
      }, (payload) => {
        if (payload.new.status === "dismissed" && !hasClosedRef.current) {
          hasClosedRef.current = true;
          stopWebAlarm();
          if (isNative) stopNativeAlarm();
          onDismissed();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [trigger.id, onDismissed, stopWebAlarm, isNative, stopNativeAlarm]);

  const handleUnlockSound = useCallback(() => {
    if (soundUnlocked) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      setSoundUnlocked(true);
    } catch (e) { /* ignore */ }
  }, [soundUnlocked]);

  const handleDismiss = async () => {
    if (!userId || dismissing) return;

    if (!canUserDismiss) {
      const remaining = (alarm.condition_value || 3) - ringCount;
      toast.error(`Wait ${remaining} more ring${remaining !== 1 ? "s" : ""}.`);
      return;
    }

    // INSTANT STOP: Kill sound synchronously — both native and web
    stopWebAlarm();
    if (isNative) stopNativeAlarm();
    setDismissing(true);

    try {
      const res = await supabase.functions.invoke("dismiss-alarm", {
        body: { trigger_id: trigger.id },
      });

      if (res.error) {
        toast.error(res.data?.error || "Failed to dismiss alarm");
        setDismissing(false);
        return;
      }

      // Log the dismissal for audit trail
      try {
        await supabase.from("alarm_audit_logs").insert({
          alarm_id: alarm.id,
          trigger_id: trigger.id,
          user_id: userId,
          action: "dismissed",
          details: {
            ring_count: ringCount,
            is_owner: isOwnerUser,
            dismissed_at: new Date().toISOString(),
          },
        });
      } catch (auditErr) {
        console.warn("Failed to log alarm audit:", auditErr);
      }

      // Notify alarm owner if someone else dismissed it
      if (!isOwnerUser) {
        try {
          await supabase.from("notifications").insert({
            user_id: alarm.created_by,
            room_id: alarm.room_id || "",
            type: "alarm",
            title: "⚠️ Alarm stopped by roommate",
            body: `Your alarm "${alarm.title}" was stopped by a roommate at ring #${ringCount}.`,
            reference_type: "alarm",
            reference_id: alarm.id,
            is_read: false,
          });
        } catch (notifyErr) {
          console.warn("Failed to notify alarm owner:", notifyErr);
        }
      }

      toast.success("Alarm dismissed!");
      hasClosedRef.current = true;
      onDismissed();
    } catch (err) {
      console.error("Error dismissing alarm:", err);
      toast.error("Failed to dismiss alarm");
      setDismissing(false);
    }
  };

  return (
    <Dialog open={true}>
      <DialogContent
        className="sm:max-w-md border-destructive bg-background"
        hideCloseButton
        onClick={handleUnlockSound}
        onTouchStart={handleUnlockSound}
        aria-describedby="alarm-description"
      >
        <VisuallyHidden>
          <DialogTitle>Alarm Ringing</DialogTitle>
        </VisuallyHidden>
        <DialogDescription id="alarm-description" className="sr-only">
          Alarm {alarm.title} is ringing at {alarm.alarm_time}
        </DialogDescription>

        <div className="text-center space-y-5 py-2">
          <div className={isOwnerDevice ? "animate-pulse" : ""}>
            {isOwnerDevice ? (
              <Bell className="h-16 w-16 mx-auto text-destructive" />
            ) : (
              <VolumeX className="h-16 w-16 mx-auto text-muted-foreground" />
            )}
          </div>

          {isOwnerDevice && !soundUnlocked && !isNative && (
            <button
              onClick={handleUnlockSound}
              className="w-full py-3 rounded-lg bg-destructive text-destructive-foreground font-semibold animate-pulse text-sm"
            >
              🔊 Tap here to enable alarm sound
            </button>
          )}

          {!isOwnerDevice && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              Silent mode — A roommate's alarm is ringing on their device
            </p>
          )}

          <div>
            <h2 className="text-4xl font-bold">{formatTime(alarm.alarm_time)}</h2>
            <p className="text-lg mt-2">{alarm.title}</p>
          </div>

          <Badge variant="outline" className="flex items-center gap-1 mx-auto w-fit">
            <Volume2 className="h-3 w-3" />
            Ring #{ringCount}
          </Badge>

          {/* Volume Control */}
          {isOwnerDevice && (
            <div className="flex items-center gap-3 px-4">
              <Volume1 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Slider
                value={[alarmVolume]}
                onValueChange={([v]) => {
                  setAlarmVolume(v);
                  setVolume(v / 100);
                }}
                onValueCommit={([v]) => {
                  // Log volume change for audit
                  if (userId) {
                    supabase.from("alarm_audit_logs").insert({
                      alarm_id: alarm.id,
                      trigger_id: trigger.id,
                      user_id: userId,
                      action: "volume_change",
                      details: { volume: v, is_owner: isOwnerUser },
                    }).then(() => {}, () => {});
                  }
                }}
                min={0}
                max={100}
                step={5}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-8">{alarmVolume}%</span>
            </div>
          )}

          <Button
            onClick={handleDismiss}
            disabled={dismissing || !canUserDismiss}
            className="w-full h-16 text-lg font-bold rounded-2xl"
            size="lg"
            variant={canUserDismiss ? "destructive" : "outline"}
          >
            <BellOff className="h-6 w-6 mr-2" />
            {dismissing
              ? "Stopping..."
              : !canUserDismiss
                ? `Wait ${Math.max(0, (alarm.condition_value || 3) - ringCount)} more ring${(alarm.condition_value || 3) - ringCount !== 1 ? "s" : ""}`
                : "STOP ALARM"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
