import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { toast } from "sonner";
import { useDeviceId } from "@/hooks/useDeviceId";
import { useNativeAlarm } from "@/hooks/useNativeAlarm";

interface CreateAlarmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string | null;
  userId: string | undefined;
  onCreated: () => void;
}

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const CONDITIONS = [
  { value: "anyone_can_dismiss", label: "Anyone can dismiss", hasValue: false },
  { value: "owner_only", label: "Only I can dismiss", hasValue: false },
  { value: "after_rings", label: "Others after X rings", hasValue: true },
  { value: "multiple_ack", label: "Requires X acks", hasValue: true },
];

const SCHEDULE_OPTIONS = [
  { value: "once", label: "🔔 Ring Once" },
  { value: "daily", label: "🔁 Daily" },
  { value: "custom", label: "📅 Custom" },
] as const;

const RINGTONES = [
  { value: "default", label: "🔔 Classic Alarm" },
  { value: "gentle", label: "🌅 Gentle Wake" },
  { value: "loud", label: "📢 Loud Siren" },
  { value: "beep", label: "🎵 Digital Beep" },
];

export function CreateAlarmDialog({ open, onOpenChange, roomId, userId, onCreated }: CreateAlarmDialogProps) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("07:00");
  const [scheduleMode, setScheduleMode] = useState<(typeof SCHEDULE_OPTIONS)[number]["value"]>("daily");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [conditionType, setConditionType] = useState("anyone_can_dismiss");
  const [conditionValue, setConditionValue] = useState(3);
  const [ringtone, setRingtone] = useState(() => localStorage.getItem("alarm_ringtone") || "default");
  const [creating, setCreating] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const deviceId = useDeviceId();
  const { isNative, createAlarm } = useNativeAlarm();

  const handleCreate = async () => {
    if (!roomId || !userId) { toast.error("Please join a room first"); return; }
    if (!title.trim()) { toast.error("Please enter an alarm title"); return; }

    const daysToUse =
      scheduleMode === "once"
        ? [new Date().getDay()]
        : scheduleMode === "daily"
          ? DAYS.map((day) => day.value)
          : selectedDays;

    if (scheduleMode === "custom" && selectedDays.length === 0) { toast.error("Please select at least one day"); return; }

    setCreating(true);
    const timezoneOffset = new Date().getTimezoneOffset();
    const [hours, minutes] = time.split(":").map(Number);

    // Save to Supabase for shared room state
    const { data: insertedAlarm, error } = await supabase.from("alarms").insert({
      room_id: roomId,
      created_by: userId,
      title: title.trim(),
      alarm_time: time,
      days_of_week: daysToUse,
      condition_type: conditionType,
      condition_value: conditionValue,
      owner_device_id: deviceId,
      timezone_offset: timezoneOffset,
    } as any).select().single();

    if (error) {
      console.error("Error creating alarm:", error);
      toast.error("Failed to create alarm");
      setCreating(false);
      return;
    }

    // Schedule native alarm (Android AlarmManager) for reliable triggering
    if (isNative && scheduleMode !== "custom") {
      const nativeCondition = conditionType === "owner_only" ? "owner_only" : "anyone";
      await createAlarm({
        id: insertedAlarm?.id || `alarm_${Date.now()}`,
        title: title.trim(),
        hour: hours,
        minute: minutes,
        repeatDaily: scheduleMode === "daily",
        stopCondition: nativeCondition,
        createdBy: userId,
      });
    }

    toast.success("Alarm created!");
    localStorage.setItem("alarm_ringtone", ringtone);

    setCreating(false);
    setTitle("");
    setTime("07:00");
    setScheduleMode("daily");
    setSelectedDays([1, 2, 3, 4, 5]);
    setConditionType("anyone_can_dismiss");
    setConditionValue(3);
    onOpenChange(false);
    onCreated();
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  const selectedCondition = CONDITIONS.find(c => c.value === conditionType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Shared Alarm</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Alarm Title</Label>
            <Input id="title" placeholder="Wake up call..." value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="time">Time</Label>
            <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="text-2xl h-14" />
          </div>

          {/* Alarm schedule */}
          <div>
            <Label className="mb-2 block">Schedule</Label>
            <div className="grid grid-cols-3 gap-2">
              {SCHEDULE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setScheduleMode(option.value)}
                  className={cn(
                    "py-3 rounded-xl text-sm font-medium transition-all border",
                    scheduleMode === option.value
                      ? "bg-primary text-primary-foreground border-primary shadow-md"
                      : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {scheduleMode === "once" && "Rings one time only."}
              {scheduleMode === "daily" && "Rings every day at the selected time."}
              {scheduleMode === "custom" && "Choose the exact days you want this alarm to ring."}
            </p>
          </div>

          {scheduleMode === "custom" && (
            <div>
              <Label>Custom Days</Label>
              <div className="flex gap-2 mt-2">
                {DAYS.map(day => (
                  <button
                    key={day.value}
                    onClick={() => toggleDay(day.value)}
                    className={`w-10 h-10 rounded-full text-sm font-medium transition-colors ${
                      selectedDays.includes(day.value)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label>Ringtone</Label>
            <Select value={ringtone} onValueChange={(v) => {
              setRingtone(v);
              if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
              if (v !== "beep") {
                const sounds: Record<string, string> = {
                  default: "/alarm_sound.wav",
                  gentle: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
                  loud: "https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3",
                };
                const audio = new Audio(sounds[v] || "/alarm_sound.wav");
                audio.volume = 0.5;
                audio.play().catch(() => {});
                setTimeout(() => { audio.pause(); audio.currentTime = 0; }, 2000);
                previewAudioRef.current = audio;
              }
            }}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RINGTONES.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Dismiss Condition</Label>
            <Select value={conditionType} onValueChange={setConditionType}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITIONS.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCondition?.hasValue && (
            <div>
              <Label htmlFor="conditionValue">
                {conditionType === "after_rings" ? "Number of rings" : "Number of people"}
              </Label>
              <Input
                id="conditionValue"
                type="number"
                min={1}
                max={10}
                value={conditionValue}
                onChange={(e) => setConditionValue(parseInt(e.target.value) || 1)}
              />
            </div>
          )}

          <Button onClick={handleCreate} disabled={creating} className="w-full">
            {creating ? "Creating..." : "Create Alarm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
