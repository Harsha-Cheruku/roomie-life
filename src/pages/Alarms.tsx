import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";
import { AlarmClock, Plus, Trash2, Users, Bell, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { CreateAlarmDialog } from "@/components/alarms/CreateAlarmDialog";
import { useNotifications } from "@/hooks/useNotifications";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { AlarmAuditLog } from "@/components/alarms/AlarmAuditLog";

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

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CONDITION_LABELS: Record<string, string> = {
  anyone_can_dismiss: "Anyone can dismiss",
  owner_only: "Owner only",
  after_rings: "Others after X rings",
  multiple_ack: "Requires X acks",
};

const RINGTONE_OPTIONS = [
  { value: "default", label: "🔔 Classic Bell" },
  { value: "gentle", label: "🌅 Gentle Chime" },
  { value: "loud", label: "📢 Loud Siren" },
  { value: "beep", label: "🎵 Digital Beep" },
];

const RINGTONE_SOUNDS: Record<string, string> = {
  default: "/alarm_sound.wav",
  gentle: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
  loud: "https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3",
};

export default function Alarms() {
  const navigate = useNavigate();
  const { user, currentRoom } = useAuth();
  const { isAdmin } = useAdminCheck();
  const roomId = currentRoom?.id || null;
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteAlarmId, setDeleteAlarmId] = useState<string | null>(null);
  const { requestPermission, hasPermission } = useNotifications();
  const [currentRingtone, setCurrentRingtone] = useState(() => {
    try { return localStorage.getItem("alarm_ringtone") || "default"; } catch { return "default"; }
  });
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (!roomId) return;
    fetchAlarms();
    const channel = supabase
      .channel("alarms-page-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "alarms", filter: `room_id=eq.${roomId}` }, () => fetchAlarms())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  const fetchAlarms = async () => {
    if (!roomId) return;
    // Only show active alarms (filter out deactivated one-time alarms)
    const { data, error } = await supabase.from("alarms").select("*").eq("room_id", roomId).eq("is_active", true).order("alarm_time");
    if (error) { console.error("Error fetching alarms:", error); return; }
    setAlarms(data || []);
    setLoading(false);
  };

  const toggleAlarm = async (alarm: Alarm) => {
    const { error } = await supabase.from("alarms").update({ is_active: !alarm.is_active }).eq("id", alarm.id);
    if (error) { toast.error("Failed to update alarm"); return; }
    setAlarms((prev) => prev.map((a) => a.id === alarm.id ? { ...a, is_active: !a.is_active } : a));
  };

  const deleteAlarm = async (alarmId: string) => {
    await supabase.from("alarm_triggers").update({ status: "dismissed", dismissed_by: user?.id, dismissed_at: new Date().toISOString() }).eq("alarm_id", alarmId).eq("status", "ringing");
    const { error } = await supabase.from("alarms").delete().eq("id", alarmId);
    if (error) { toast.error("Failed to delete alarm"); return; }
    setAlarms((prev) => prev.filter((a) => a.id !== alarmId));
    toast.success("Alarm deleted");
    setDeleteAlarmId(null);
  };

  const handleRingtoneChange = (value: string) => {
    // Stop any playing preview
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }

    setCurrentRingtone(value);
    localStorage.setItem("alarm_ringtone", value);
    toast.success(`Ringtone set to ${RINGTONE_OPTIONS.find(r => r.value === value)?.label || value}`);

    // Preview the sound
    if (value !== "beep" && RINGTONE_SOUNDS[value]) {
      const audio = new Audio(RINGTONE_SOUNDS[value]);
      audio.volume = 0.5;
      audio.play().catch(() => {});
      setTimeout(() => { audio.pause(); audio.currentTime = 0; }, 2500);
      previewAudioRef.current = audio;
    }
  };

  const handleTabChange = (tab: string) => {
    const routes: Record<string, string> = { home: "/", tasks: "/tasks", expenses: "/expenses", storage: "/storage", chat: "/chat" };
    navigate(routes[tab] || "/");
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const getConditionText = (alarm: Alarm) => {
    if (alarm.condition_type === "after_rings") return `After ${alarm.condition_value} rings`;
    if (alarm.condition_type === "multiple_ack") return `${alarm.condition_value} acks needed`;
    return CONDITION_LABELS[alarm.condition_type] || alarm.condition_type;
  };

  // Admin or owner can delete
  const canDelete = (alarm: Alarm) => alarm.created_by === user?.id || isAdmin;

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar
        title="Shared Alarms"
        showBack={true}
        onBack={() => navigate("/")}
        hint="Wake up together with your roommates 🔔"
        rightContent={
          <div className="flex gap-2">
            {!hasPermission && (
              <Button onClick={requestPermission} variant="outline" size="sm">
                <Bell className="h-4 w-4 mr-1" /> Enable
              </Button>
            )}
            <Button onClick={() => setShowCreateDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        }
      />

      <div className="p-4 space-y-4">
        {/* Ringtone selector */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <Volume2 className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Alarm Ringtone</p>
              </div>
              <Select value={currentRingtone} onValueChange={handleRingtoneChange}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RINGTONE_OPTIONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : alarms.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <AlarmClock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No active alarms</p>
              <p className="text-sm text-muted-foreground">Create a shared alarm for your room</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {alarms.map((alarm) => (
              <Card key={alarm.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-3xl font-bold">{formatTime(alarm.alarm_time)}</span>
                        <Switch checked={alarm.is_active} onCheckedChange={() => toggleAlarm(alarm)} />
                      </div>
                      <p className="font-medium text-foreground">{alarm.title}</p>
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {alarm.days_of_week.map((day) => (
                          <Badge key={day} variant="secondary" className="text-xs">{DAYS[day]}</Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
                        <Users className="h-3 w-3" />
                        <span>{getConditionText(alarm)}</span>
                      </div>
                    </div>
                    {canDelete(alarm) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteAlarmId(alarm.id)}
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

      {/* Alarm Activity Log */}
      <div className="px-4 pb-4">
        <AlarmAuditLog roomId={roomId} />
      </div>

      <DeleteConfirmDialog
        open={!!deleteAlarmId}
        onOpenChange={(open) => !open && setDeleteAlarmId(null)}
        onConfirm={() => deleteAlarmId ? deleteAlarm(deleteAlarmId) : Promise.resolve()}
        title="Delete Alarm"
        description="Are you sure you want to delete this alarm? This will also dismiss any active triggers."
        itemName={alarms.find(a => a.id === deleteAlarmId)?.title || "Alarm"}
      />

      <CreateAlarmDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        roomId={roomId}
        userId={user?.id}
        onCreated={fetchAlarms}
      />

      <BottomNav activeTab="home" onTabChange={handleTabChange} />
    </div>
  );
}
