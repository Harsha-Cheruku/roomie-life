import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bug, Clock, Hash, UserCheck, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface AlarmTriggerLog {
  id: string;
  alarm_id: string;
  alarm_title: string;
  triggered_at: string;
  ring_count: number;
  status: string;
  dismissed_by: string | null;
  dismissed_at: string | null;
  dismisser_name?: string;
}

interface AlarmDebugPanelProps {
  roomId: string | null;
}

export const AlarmDebugPanel = ({ roomId }: AlarmDebugPanelProps) => {
  const [triggers, setTriggers] = useState<AlarmTriggerLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!roomId) return;
    fetchTriggerLogs();

    const channel = supabase
      .channel('alarm-triggers-debug')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'alarm_triggers'
      }, () => fetchTriggerLogs())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const fetchTriggerLogs = async () => {
    if (!roomId) return;

    try {
      const { data, error } = await supabase
        .from('alarm_triggers')
        .select(`
          id,
          alarm_id,
          triggered_at,
          ring_count,
          status,
          dismissed_by,
          dismissed_at,
          alarms!inner(title, room_id)
        `)
        .eq('alarms.room_id', roomId)
        .order('triggered_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Fetch dismisser profiles
      const dismisserIds = data?.filter(t => t.dismissed_by).map(t => t.dismissed_by!) || [];
      let profileMap = new Map<string, string>();
      
      if (dismisserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', dismisserIds);
        
        profiles?.forEach(p => profileMap.set(p.user_id, p.display_name));
      }

      const triggersWithInfo = data?.map(t => ({
        id: t.id,
        alarm_id: t.alarm_id,
        alarm_title: (t.alarms as any).title,
        triggered_at: t.triggered_at,
        ring_count: t.ring_count,
        status: t.status,
        dismissed_by: t.dismissed_by,
        dismissed_at: t.dismissed_at,
        dismisser_name: t.dismissed_by ? profileMap.get(t.dismissed_by) : undefined
      })) || [];

      setTriggers(triggersWithInfo);
    } catch (error) {
      console.error('Error fetching trigger logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ringing': return 'bg-red-500 animate-pulse';
      case 'dismissed': return 'bg-green-500';
      case 'snoozed': return 'bg-yellow-500';
      default: return 'bg-muted';
    }
  };

  const getDismissalReason = (trigger: AlarmTriggerLog) => {
    if (trigger.status === 'ringing') return 'Currently ringing';
    if (trigger.status === 'dismissed') {
      if (trigger.dismisser_name) {
        return `Dismissed by ${trigger.dismisser_name}`;
      }
      return 'Dismissed';
    }
    if (trigger.status === 'snoozed') return 'Snoozed';
    return 'Unknown';
  };

  if (isLoading) {
    return (
      <Card className="bg-muted/30 border-dashed border-2 border-muted">
        <CardContent className="py-4 text-center text-muted-foreground">
          Loading debug info...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-muted/30 border-dashed border-2 border-muted">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
          <Bug className="h-4 w-4" />
          Alarm Debug Panel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {triggers.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No alarm triggers recorded yet</p>
          </div>
        ) : (
          triggers.map((trigger) => (
            <div 
              key={trigger.id} 
              className="bg-background rounded-lg p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm truncate flex-1">
                  {trigger.alarm_title}
                </span>
                <Badge 
                  variant="secondary" 
                  className={`${getStatusColor(trigger.status)} text-white text-xs`}
                >
                  {trigger.status}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>
                    {format(new Date(trigger.triggered_at), 'MMM d, h:mm:ss a')}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  <span>Rings: {trigger.ring_count}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-1 text-xs">
                <UserCheck className="h-3 w-3 text-muted-foreground" />
                <span className={trigger.status === 'ringing' ? 'text-red-500' : 'text-green-600'}>
                  {getDismissalReason(trigger)}
                </span>
                {trigger.dismissed_at && (
                  <span className="text-muted-foreground ml-1">
                    at {format(new Date(trigger.dismissed_at), 'h:mm:ss a')}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};
