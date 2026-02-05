import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useDeviceId } from "@/hooks/useDeviceId";

interface CreateAlarmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string | null;
  userId: string | undefined;
  onCreated: () => void;
}

const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const CONDITIONS = [
  { value: 'anyone_can_dismiss', label: 'Anyone can dismiss', hasValue: false },
  { value: 'owner_only', label: 'Only I can dismiss', hasValue: false },
  { value: 'after_rings', label: 'Others can dismiss after X rings', hasValue: true },
  { value: 'multiple_ack', label: 'Requires X people to acknowledge', hasValue: true },
];

export function CreateAlarmDialog({ open, onOpenChange, roomId, userId, onCreated }: CreateAlarmDialogProps) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('07:00');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [conditionType, setConditionType] = useState('anyone_can_dismiss');
  const [conditionValue, setConditionValue] = useState(3);
  const [creating, setCreating] = useState(false);
  const deviceId = useDeviceId();

  const handleCreate = async () => {
    if (!roomId || !userId) {
      toast.error('Please join a room first');
      return;
    }

    if (!title.trim()) {
      toast.error('Please enter an alarm title');
      return;
    }

    if (selectedDays.length === 0) {
      toast.error('Please select at least one day');
      return;
    }

    setCreating(true);

    const { error } = await supabase.from('alarms').insert({
      room_id: roomId,
      created_by: userId,
      title: title.trim(),
      alarm_time: time,
      days_of_week: selectedDays,
      condition_type: conditionType,
      condition_value: conditionValue,
      // Per-device ownership: only this device is allowed to trigger + ring this alarm.
      owner_device_id: deviceId,
    } as any);

    setCreating(false);

    if (error) {
      console.error('Error creating alarm:', error);
      toast.error('Failed to create alarm');
      return;
    }

    toast.success('Alarm created!');
    setTitle('');
    setTime('07:00');
    setSelectedDays([1, 2, 3, 4, 5]);
    setConditionType('anyone_can_dismiss');
    setConditionValue(3);
    onOpenChange(false);
    onCreated();
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  const selectedCondition = CONDITIONS.find(c => c.value === conditionType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Shared Alarm</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Alarm Title</Label>
            <Input
              id="title"
              placeholder="Wake up call, Morning routine..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="time">Time</Label>
            <Input
              id="time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="text-2xl h-14"
            />
          </div>

          <div>
            <Label>Repeat Days</Label>
            <div className="flex gap-2 mt-2">
              {DAYS.map(day => (
                <button
                  key={day.value}
                  onClick={() => toggleDay(day.value)}
                  className={`w-10 h-10 rounded-full text-sm font-medium transition-colors ${
                    selectedDays.includes(day.value)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Dismiss Condition</Label>
            <Select value={conditionType} onValueChange={setConditionType}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITIONS.map(condition => (
                  <SelectItem key={condition.value} value={condition.value}>
                    {condition.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCondition?.hasValue && (
            <div>
              <Label htmlFor="conditionValue">
                {conditionType === 'after_rings' ? 'Number of rings' : 'Number of people'}
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
            {creating ? 'Creating...' : 'Create Alarm'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}