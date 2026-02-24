import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { useDeviceId } from "@/hooks/useDeviceId";
import { useAuth } from "@/contexts/AuthContext";

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
  onDismissed: () => void;
}

/**
 * Alarm modal — shows globally (mounted from Index.tsx).
 * Sound is controlled by useGlobalAlarm hook, NOT here.
 * Dismissal goes through the atomic dismiss-alarm edge function.
 */
export function ActiveAlarmModal({ trigger, alarm, onDismissed }: ActiveAlarmModalProps) {
  const RING_LENGTH_MS = 5000;
  const { user } = useAuth();
  const userId = user?.id;
  const deviceId = useDeviceId();
  const triggeredAtMs = useMemo(() => new Date(trigger.triggered_at).getTime(), [trigger.triggered_at]);

  const [ringCount, setRingCount] = useState<number>(() => {
    const diff = Date.now() - triggeredAtMs;
    return Math.max(1, Math.floor(diff / RING_LENGTH_MS) + 1);
  });
  const [dismissing, setDismissing] = useState(false);
  const hasClosedRef = useRef(false);

  const isOwnerDevice = Boolean(
    userId &&
      userId === alarm.created_by &&
      alarm.owner_device_id &&
      alarm.owner_device_id === deviceId
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

  // Ring count UI ticker
  useEffect(() => {
    const interval = window.setInterval(() => {
      const newRingCount = Math.max(1, Math.floor((Date.now() - triggeredAtMs) / RING_LENGTH_MS) + 1);
      setRingCount(newRingCount);
    }, 1000);
    return () => clearInterval(interval);
  }, [triggeredAtMs]);

  // Listen for cross-device dismiss
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
          onDismissed();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [trigger.id, onDismissed]);

  const handleDismiss = async () => {
    if (!userId || dismissing) return;

    if (!canUserDismiss) {
      const remaining = (alarm.condition_value || 3) - ringCount;
      toast.error(`Wait ${remaining} more ring${remaining !== 1 ? "s" : ""}.`);
      return;
    }

    setDismissing(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      
      if (!accessToken) {
        toast.error("Not authenticated");
        setDismissing(false);
        return;
      }

      const res = await supabase.functions.invoke("dismiss-alarm", {
        body: { trigger_id: trigger.id },
      });

      if (res.error) {
        const errorData = res.data;
        toast.error(errorData?.error || "Failed to dismiss alarm");
        setDismissing(false);
        return;
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
            disabled={dismissing || !canUserDismiss}
            className="w-full"
            size="lg"
            variant={canUserDismiss ? "default" : "outline"}
          >
            <BellOff className="h-5 w-5 mr-2" />
            {dismissing
              ? "Dismissing..."
              : !canUserDismiss
                ? `Wait ${(alarm.condition_value || 3) - ringCount} more ring${(alarm.condition_value || 3) - ringCount !== 1 ? "s" : ""}`
                : "Dismiss Alarm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
