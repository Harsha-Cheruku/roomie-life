import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Users, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useAlarmSound } from "@/hooks/useAlarmSound";
import { useNotifications } from "@/hooks/useNotifications";

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
}

interface ActiveAlarmModalProps {
  trigger: AlarmTrigger;
  alarm: Alarm;
  userId: string | undefined;
  onDismissed: () => void;
}

export function ActiveAlarmModal({ trigger, alarm, userId, onDismissed }: ActiveAlarmModalProps) {
  const triggeredAtMs = useMemo(() => new Date(trigger.triggered_at).getTime(), [trigger.triggered_at]);
  const ringIntervalRef = useRef<number | null>(null);
  const hasStartedRef = useRef(false);
  const isMountedRef = useRef(true);

  const [ringCount, setRingCount] = useState<number>(() => {
    const diff = Date.now() - triggeredAtMs;
    return Math.max(1, Math.floor(diff / 5000) + 1);
  });
  const [acknowledgments, setAcknowledgments] = useState<string[]>([]);
  const [canDismiss, setCanDismiss] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const { playAlarm, stopAlarm } = useAlarmSound();
  const { sendAlarmNotification } = useNotifications();

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Cleanup function to stop everything
  const cleanupAlarm = useCallback(() => {
    console.log("Alarm: Cleaning up...");
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    stopAlarm();
  }, [stopAlarm]);

  useEffect(() => {
    isMountedRef.current = true;
    
    // Prevent double-start
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    // Play alarm sound immediately
    const startAlarm = async () => {
      try {
        await playAlarm();
        console.log("Alarm sound started successfully");
      } catch (error) {
        console.error("Failed to start alarm sound:", error);
      }
    };

    startAlarm();

    // Send notification for background/locked screen
    sendAlarmNotification(alarm.title, formatTime(alarm.alarm_time));

    // Keep ring count consistent across devices based on triggered_at
    ringIntervalRef.current = window.setInterval(() => {
      if (isMountedRef.current) {
        setRingCount(Math.max(1, Math.floor((Date.now() - triggeredAtMs) / 5000) + 1));
      }
    }, 1000);

    // Subscribe to acknowledgments
    const ackChannel = supabase
      .channel(`ack-changes-${trigger.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'alarm_acknowledgments',
        filter: `trigger_id=eq.${trigger.id}`
      }, (payload) => {
        if (isMountedRef.current) {
          setAcknowledgments(prev => [...prev, payload.new.user_id]);
        }
      })
      .subscribe();

    fetchAcknowledgments();

    return () => {
      isMountedRef.current = false;
      cleanupAlarm();
      supabase.removeChannel(ackChannel);
    };
  }, [trigger.id, alarm.title, alarm.alarm_time, playAlarm, sendAlarmNotification, triggeredAtMs, cleanupAlarm]);

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
          console.log("Alarm dismissed by another user - stopping sound");
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
    // Check if user can dismiss based on conditions
    const isOwner = userId === alarm.created_by;

    switch (alarm.condition_type) {
      case 'anyone_can_dismiss':
        setCanDismiss(true);
        break;
      case 'owner_only':
        setCanDismiss(isOwner);
        break;
      case 'after_rings':
        setCanDismiss(isOwner || ringCount >= alarm.condition_value);
        break;
      case 'multiple_ack':
        setCanDismiss(isOwner || acknowledgments.length >= alarm.condition_value);
        break;
      default:
        setCanDismiss(true);
    }
  }, [alarm, userId, ringCount, acknowledgments]);

  const fetchAcknowledgments = async () => {
    const { data } = await supabase
      .from('alarm_acknowledgments')
      .select('user_id')
      .eq('trigger_id', trigger.id);

    if (data) {
      setAcknowledgments(data.map(a => a.user_id));
    }
  };

  const handleAcknowledge = async () => {
    if (!userId) return;

    const { error } = await supabase
      .from('alarm_acknowledgments')
      .insert({
        trigger_id: trigger.id,
        user_id: userId
      });

    if (error && !error.message.includes('duplicate')) {
      toast.error('Failed to acknowledge');
      return;
    }

    toast.success("You're awake!");
  };

  const handleDismiss = async () => {
    if (!userId || !canDismiss || dismissing) return;

    setDismissing(true);
    
    // IMMEDIATELY stop everything before any async operation
    console.log("Alarm: Dismissing - stopping immediately");
    cleanupAlarm();

    try {
      const { error } = await supabase
        .from('alarm_triggers')
        .update({
          status: 'dismissed',
          dismissed_by: userId,
          dismissed_at: new Date().toISOString()
        })
        .eq('id', trigger.id);

      if (error) {
        toast.error('Failed to dismiss alarm');
        setDismissing(false);
        return;
      }

      toast.success('Alarm dismissed!');
      onDismissed();
    } catch (err) {
      console.error('Error dismissing alarm:', err);
      toast.error('Failed to dismiss alarm');
      setDismissing(false);
    }
  };

  const getStatusMessage = () => {
    if (alarm.condition_type === 'after_rings' && !canDismiss) {
      return `Wait for ${Math.max(0, alarm.condition_value - ringCount)} more rings`;
    }
    if (alarm.condition_type === 'multiple_ack' && !canDismiss) {
      return `Need ${Math.max(0, alarm.condition_value - acknowledgments.length)} more people to acknowledge`;
    }
    if (alarm.condition_type === 'owner_only' && !canDismiss) {
      return 'Only the owner can dismiss this alarm';
    }
    return null;
  };

  const hasAcknowledged = acknowledgments.includes(userId || '');

  return (
    <Dialog open={true}>
      <DialogContent className="sm:max-w-md bg-destructive/10 border-destructive" hideCloseButton>
        <div className="text-center space-y-6 py-4">
          <div className="animate-pulse">
            <Bell className="h-16 w-16 mx-auto text-destructive" />
          </div>

          <div>
            <h2 className="text-4xl font-bold">{formatTime(alarm.alarm_time)}</h2>
            <p className="text-lg mt-2">{alarm.title}</p>
          </div>

          <div className="flex items-center justify-center gap-4">
            <Badge variant="outline" className="flex items-center gap-1">
              <Volume2 className="h-3 w-3" />
              Ring #{ringCount}
            </Badge>
            {alarm.condition_type === 'multiple_ack' && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {acknowledgments.length}/{alarm.condition_value} awake
              </Badge>
            )}
          </div>

          {getStatusMessage() && (
            <p className="text-sm text-muted-foreground">{getStatusMessage()}</p>
          )}

          <div className="space-y-3">
            {alarm.condition_type === 'multiple_ack' && !hasAcknowledged && (
              <Button
                onClick={handleAcknowledge}
                variant="secondary"
                className="w-full"
              >
                <Users className="h-4 w-4 mr-2" />
                I'm Awake!
              </Button>
            )}

            <Button
              onClick={handleDismiss}
              disabled={!canDismiss || dismissing}
              className="w-full"
              size="lg"
            >
              <BellOff className="h-5 w-5 mr-2" />
              {dismissing ? 'Dismissing...' : 'Dismiss Alarm'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
