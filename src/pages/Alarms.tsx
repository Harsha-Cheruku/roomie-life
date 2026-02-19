import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";
import { AlarmClock, Plus, Trash2, Users, Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { CreateAlarmDialog } from "@/components/alarms/CreateAlarmDialog";
import { ActiveAlarmModal } from "@/components/alarms/ActiveAlarmModal";
import { AlarmDebugPanel } from "@/components/alarms/AlarmDebugPanel";
import { useNotifications } from "@/hooks/useNotifications";
import { useAlarmSound } from "@/hooks/useAlarmSound";
import { useDeviceId } from "@/hooks/useDeviceId";

/**
 * Alarm Behavior:
 * - Alarm rings ONLY on the creator's device with full sound
 * - Other roommates receive silent notifications
 * - Anyone can dismiss the alarm (syncs across all devices)
 * - Alarm auto-dismisses after 3 rings
 */

interface Alarm {
  id: string;
  title: string;
  alarm_time: string;
  days_of_week: number[];
  is_active: boolean;
  condition_type: string;
  condition_value: number;
  created_by: string;
  room_id: string;
  owner_device_id?: string | null;
}

interface AlarmTrigger {
  id: string;
  alarm_id: string;
  ring_count: number;
  status: string;
  dismissed_by: string | null;
  triggered_at: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CONDITION_LABELS: Record<string, string> = {
  'anyone_can_dismiss': 'Anyone can dismiss',
  'owner_only': 'Owner only',
  'after_rings': 'Others can dismiss after X rings',
  'multiple_ack': 'Requires X people to acknowledge'
};

export default function Alarms() {
  const navigate = useNavigate();
  const { user, currentRoom } = useAuth();
  const roomId = currentRoom?.id || null;
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [activeTrigger, setActiveTrigger] = useState<AlarmTrigger | null>(null);
  const [activeAlarm, setActiveAlarm] = useState<Alarm | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const { requestPermission, hasPermission } = useNotifications();
  const { preloadAudio } = useAlarmSound();
  const lastTriggeredRef = useRef<Map<string, number>>(new Map());
  const deviceId = useDeviceId();

  // Preload alarm sound on mount
  useEffect(() => {
    preloadAudio();
    
    // Request notification permission on mount
    if (!hasPermission) {
      requestPermission();
    }
  }, [preloadAudio, hasPermission, requestPermission]);

  useEffect(() => {
    if (!roomId) return;
    fetchAlarms();
    checkActiveAlarms();
    
    // Set up realtime subscriptions
    const alarmsChannel = supabase
      .channel('alarms-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'alarms',
        filter: `room_id=eq.${roomId}`
      }, () => fetchAlarms())
      .subscribe();

    const triggersChannel = supabase
      .channel('triggers-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'alarm_triggers'
      }, () => checkActiveAlarms())
      .subscribe();

    // Check for alarms every 10 seconds for better accuracy (still debounced)
    const interval = setInterval(checkAndTriggerAlarms, 10000);
    
    // Also run immediately
    checkAndTriggerAlarms();

    return () => {
      supabase.removeChannel(alarmsChannel);
      supabase.removeChannel(triggersChannel);
      clearInterval(interval);
    };
  }, [roomId, alarms]);

  const fetchAlarms = async () => {
    if (!roomId) return;
    
    const { data, error } = await supabase
      .from('alarms')
      .select('*')
      .eq('room_id', roomId)
      .order('alarm_time');
    
    if (error) {
      console.error('Error fetching alarms:', error);
      return;
    }
    
    setAlarms(data || []);
    setLoading(false);
  };

  const checkActiveAlarms = async () => {
    if (!roomId) return;

    const { data: triggers, error } = await supabase
      .from('alarm_triggers')
      .select('*, alarms!inner(*)')
      .eq('status', 'ringing')
      .eq('alarms.room_id', roomId)
      .order('triggered_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error checking active alarms:', error);
      return;
    }

    if (triggers && triggers.length > 0) {
      const trigger = triggers[0];
      setActiveTrigger({
        id: trigger.id,
        alarm_id: trigger.alarm_id,
        ring_count: trigger.ring_count,
        status: trigger.status,
        dismissed_by: trigger.dismissed_by,
        triggered_at: trigger.triggered_at
      });
      setActiveAlarm(trigger.alarms as unknown as Alarm);
    } else {
      setActiveTrigger(null);
      setActiveAlarm(null);
    }
  };

  const checkAndTriggerAlarms = useCallback(async () => {
    if (!roomId || !user || alarms.length === 0) return;

     const now = new Date();
     const currentDay = now.getDay();
 
     for (const alarm of alarms) {
       // HARD RULE: only the alarm creator's *owner device* is allowed to trigger.
       if (alarm.created_by !== user.id) continue;
       if (alarm.owner_device_id && alarm.owner_device_id !== deviceId) continue;

       if (!alarm.is_active) continue;
       if (!alarm.days_of_week.includes(currentDay)) continue;
 
       const [hh, mm] = alarm.alarm_time
         .slice(0, 5)
         .split(':')
         .map((v) => parseInt(v, 10));

       const alarmDate = new Date(now);
       alarmDate.setHours(hh, mm, 0, 0);

       const diffMs = now.getTime() - alarmDate.getTime();
       // Trigger if we are within the first minute after the alarm time
       if (diffMs < 0 || diffMs > 60_000) continue;

      // Local debounce - prevent triggering same alarm within 2 minutes
      const lastTriggered = lastTriggeredRef.current.get(alarm.id);
      if (lastTriggered && now.getTime() - lastTriggered < 120000) {
        continue;
      }

      // Check if already triggered in the database in the last 2 minutes
      const { data: existingTrigger } = await supabase
        .from('alarm_triggers')
        .select('*')
        .eq('alarm_id', alarm.id)
        .gte('triggered_at', new Date(now.getTime() - 120000).toISOString())
        .maybeSingle();

      if (existingTrigger) {
        // Mark as triggered locally too
        lastTriggeredRef.current.set(alarm.id, now.getTime());
        continue;
      }

       // Backward-compatible ownership claim for older alarms (owner_device_id was added later).
       // We only claim when the alarm is actually due to ring.
       if (!alarm.owner_device_id) {
         const { data: claimed, error: claimError } = await supabase
           .from('alarms')
           .update({ owner_device_id: deviceId } as any)
           .eq('id', alarm.id)
           .is('owner_device_id', null)
           .select('id')
           .maybeSingle();

         if (claimError) {
           console.error('Error claiming alarm ownership:', claimError);
           continue;
         }

         // Another device may have claimed it first.
         if (!claimed) continue;

         setAlarms(prev => prev.map(a => (a.id === alarm.id ? { ...a, owner_device_id: deviceId } : a)));
       }

      console.log("Triggering alarm:", alarm.title);

      // Mark as triggered locally
      lastTriggeredRef.current.set(alarm.id, now.getTime());

      // Create new trigger
      const { error } = await supabase
        .from('alarm_triggers')
        .insert({
          alarm_id: alarm.id,
          status: 'ringing',
          ring_count: 0
        });

      if (error) {
        console.error('Error triggering alarm:', error);
        // Remove local trigger mark on error
        lastTriggeredRef.current.delete(alarm.id);
      } else {
        // Refresh to show the modal
        checkActiveAlarms();
      }
    }
  }, [roomId, user, alarms, deviceId]);

  const toggleAlarm = async (alarm: Alarm) => {
    const { error } = await supabase
      .from('alarms')
      .update({ is_active: !alarm.is_active })
      .eq('id', alarm.id);

    if (error) {
      toast.error('Failed to update alarm');
      return;
    }

    setAlarms(prev => prev.map(a => 
      a.id === alarm.id ? { ...a, is_active: !a.is_active } : a
    ));
  };

  const deleteAlarm = async (alarmId: string) => {
    // First, dismiss any active triggers for this alarm to prevent ghost rings
    await supabase
      .from('alarm_triggers')
      .update({ status: 'dismissed', dismissed_by: user?.id, dismissed_at: new Date().toISOString() })
      .eq('alarm_id', alarmId)
      .eq('status', 'ringing');

    // Clear from local trigger tracking
    lastTriggeredRef.current.delete(alarmId);

    // If the currently active trigger belongs to this alarm, clear it
    if (activeTrigger?.alarm_id === alarmId) {
      setActiveTrigger(null);
      setActiveAlarm(null);
    }

    const { error } = await supabase
      .from('alarms')
      .delete()
      .eq('id', alarmId);

    if (error) {
      toast.error('Failed to delete alarm');
      return;
    }

    setAlarms(prev => prev.filter(a => a.id !== alarmId));
    toast.success('Alarm deleted — it will never ring again');
  };

  const handleTabChange = (tab: string) => {
    const routes: Record<string, string> = {
      home: '/',
      tasks: '/tasks',
      expenses: '/expenses',
      storage: '/storage',
      chat: '/chat'
    };
    navigate(routes[tab] || '/');
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const getConditionText = (alarm: Alarm) => {
    if (alarm.condition_type === 'after_rings') {
      return `Others can dismiss after ${alarm.condition_value} rings`;
    }
    if (alarm.condition_type === 'multiple_ack') {
      return `Requires ${alarm.condition_value} people to acknowledge`;
    }
    return CONDITION_LABELS[alarm.condition_type] || alarm.condition_type;
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar
        title="Shared Alarms"
        showBack={true}
        onBack={() => navigate('/')}
        hint="Wake up together with your roommates 🔔"
        rightContent={
          <div className="flex gap-2">
            {!hasPermission && (
              <Button onClick={requestPermission} variant="outline" size="sm">
                <Bell className="h-4 w-4 mr-1" />
                Enable
              </Button>
            )}
            <Button onClick={() => setShowCreateDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        }
      />

      <div className="p-4 space-y-4">
        {/* Debug Panel */}
        <AlarmDebugPanel roomId={roomId} />

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : alarms.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <AlarmClock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No alarms set</p>
              <p className="text-sm text-muted-foreground">Create a shared alarm for your room</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {alarms.map(alarm => (
              <Card key={alarm.id} className={!alarm.is_active ? 'opacity-50' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-3xl font-bold">{formatTime(alarm.alarm_time)}</span>
                        <Switch
                          checked={alarm.is_active}
                          onCheckedChange={() => toggleAlarm(alarm)}
                        />
                      </div>
                      <p className="font-medium text-foreground">{alarm.title}</p>
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {alarm.days_of_week.map(day => (
                          <Badge key={day} variant="secondary" className="text-xs">
                            {DAYS[day]}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
                        <Users className="h-3 w-3" />
                        <span>{getConditionText(alarm)}</span>
                      </div>
                    </div>
                    {alarm.created_by === user?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteAlarm(alarm.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateAlarmDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        roomId={roomId}
        userId={user?.id}
        onCreated={fetchAlarms}
      />

      {activeTrigger && activeAlarm && (
        <ActiveAlarmModal
          trigger={activeTrigger}
          alarm={activeAlarm}
          userId={user?.id}
          onDismissed={() => {
            setActiveTrigger(null);
            setActiveAlarm(null);
          }}
        />
      )}

      <BottomNav activeTab="home" onTabChange={handleTabChange} />
    </div>
  );
}