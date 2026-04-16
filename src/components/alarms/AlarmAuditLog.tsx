import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BellOff, Volume2, Clock } from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  user_id: string;
  alarm_id: string;
  trigger_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
  user_name?: string;
  alarm_title?: string;
}

interface AlarmAuditLogProps {
  roomId: string;
}

export function AlarmAuditLog({ roomId }: AlarmAuditLogProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const { data: logs, error } = await supabase
          .from("alarm_audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);

        if (error || !logs) {
          setEntries([]);
          setLoading(false);
          return;
        }

        // Fetch alarm titles and user names
        const alarmIds = [...new Set(logs.map((l) => l.alarm_id))];
        const userIds = [...new Set(logs.map((l) => l.user_id))];

        const [alarmsRes, profilesRes] = await Promise.all([
          supabase.from("alarms").select("id, title, room_id").in("id", alarmIds),
          supabase.from("profiles").select("user_id, display_name").in("user_id", userIds),
        ]);

        const alarmMap = new Map(
          (alarmsRes.data || [])
            .filter((a) => a.room_id === roomId)
            .map((a) => [a.id, a.title])
        );
        const profileMap = new Map(
          (profilesRes.data || []).map((p) => [p.user_id, p.display_name])
        );

        const filtered = logs
          .filter((l) => alarmMap.has(l.alarm_id))
          .map((l) => ({
            ...l,
            details: l.details as Record<string, any> | null,
            user_name: profileMap.get(l.user_id) || "Unknown",
            alarm_title: alarmMap.get(l.alarm_id) || "Alarm",
          }));

        setEntries(filtered);
      } catch (err) {
        console.error("Failed to fetch audit logs:", err);
      } finally {
        setLoading(false);
      }
    };

    if (roomId) fetchLogs();
  }, [roomId]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case "dismissed": return <BellOff className="h-3.5 w-3.5" />;
      case "volume_change": return <Volume2 className="h-3.5 w-3.5" />;
      default: return <Clock className="h-3.5 w-3.5" />;
    }
  };

  const getActionLabel = (entry: AuditEntry) => {
    const isOwner = entry.details?.is_owner;
    switch (entry.action) {
      case "dismissed":
        return isOwner
          ? `${entry.user_name} stopped their alarm "${entry.alarm_title}"`
          : `${entry.user_name} stopped ${entry.alarm_title} (ring #${entry.details?.ring_count || "?"})`;
      case "volume_change":
        return `${entry.user_name} changed volume to ${entry.details?.volume ?? "?"}%`;
      default:
        return `${entry.user_name}: ${entry.action}`;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "dismissed": return "destructive" as const;
      case "volume_change": return "secondary" as const;
      default: return "outline" as const;
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Loading alarm activity...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Alarm Activity Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No alarm activity yet
          </p>
        ) : (
          <ScrollArea className="max-h-64">
            <div className="space-y-2">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 text-sm border-b border-border/50 pb-2 last:border-0"
                >
                  <div className="mt-0.5 text-muted-foreground">
                    {getActionIcon(entry.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground leading-snug">
                      {getActionLabel(entry)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatTime(entry.created_at)}
                    </p>
                  </div>
                  <Badge variant={getActionColor(entry.action)} className="text-[10px] shrink-0">
                    {entry.action}
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
