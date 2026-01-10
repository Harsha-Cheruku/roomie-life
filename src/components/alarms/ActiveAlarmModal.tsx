import { useState, useEffect } from "react";
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
  const [ringCount, setRingCount] = useState(trigger.ring_count);
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

  useEffect(() => {
    // Play alarm sound with fallback
    playAlarm();
    
    // Send notification for background/locked screen
    sendAlarmNotification(alarm.title, formatTime(alarm.alarm_time));

    // Increment ring count every 5 seconds
    const ringInterval = setInterval(async () => {
      const newCount = ringCount + 1;
      setRingCount(newCount);
      
      await supabase
        .from('alarm_triggers')
        .update({ ring_count: newCount })
        .eq('id', trigger.id);
    }, 5000);

    // Subscribe to acknowledgments
    const ackChannel = supabase
      .channel('ack-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'alarm_acknowledgments',
        filter: `trigger_id=eq.${trigger.id}`
      }, (payload) => {
        setAcknowledgments(prev => [...prev, payload.new.user_id]);
      })
      .subscribe();

    fetchAcknowledgments();

    return () => {
      stopAlarm();
      clearInterval(ringInterval);
      supabase.removeChannel(ackChannel);
    };
  }, [trigger.id]);

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
    if (!userId || !canDismiss) return;

    setDismissing(true);

    const { error } = await supabase
      .from('alarm_triggers')
      .update({
        status: 'dismissed',
        dismissed_by: userId,
        dismissed_at: new Date().toISOString()
      })
      .eq('id', trigger.id);

    setDismissing(false);

    if (error) {
      toast.error('Failed to dismiss alarm');
      return;
    }

    stopAlarm();

    toast.success('Alarm dismissed!');
    onDismissed();
  };


  const getStatusMessage = () => {
    if (alarm.condition_type === 'after_rings' && !canDismiss) {
      return `Wait for ${alarm.condition_value - ringCount} more rings`;
    }
    if (alarm.condition_type === 'multiple_ack' && !canDismiss) {
      return `Need ${alarm.condition_value - acknowledgments.length} more people to acknowledge`;
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