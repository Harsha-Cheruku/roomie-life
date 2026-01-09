import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Bell, Calendar, Clock } from 'lucide-react';

interface RoomMember {
  user_id: string;
  display_name: string;
  avatar: string;
}

interface CreateReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  userId: string;
  members: RoomMember[];
  onCreated: () => void;
}

export function CreateReminderDialog({
  open,
  onOpenChange,
  roomId,
  userId,
  members,
  onCreated
}: CreateReminderDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [conditionType, setConditionType] = useState<'none' | 'task_completed' | 'expense_paid'>('none');
  const [allowedCompleters, setAllowedCompleters] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const otherMembers = members.filter(m => m.user_id !== userId);

  const toggleCompleter = (memberId: string) => {
    setAllowedCompleters(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleCreate = async () => {
    if (!title.trim() || !date || !time) {
      toast.error('Please fill in title, date and time');
      return;
    }

    const remindAt = new Date(`${date}T${time}`);
    if (remindAt <= new Date()) {
      toast.error('Reminder time must be in the future');
      return;
    }

    setIsCreating(true);
    try {
      const { error } = await supabase.from('reminders').insert({
        room_id: roomId,
        created_by: userId,
        title: title.trim(),
        description: description.trim() || null,
        remind_at: remindAt.toISOString(),
        condition_type: conditionType,
        allowed_completers: allowedCompleters.length > 0 ? allowedCompleters : otherMembers.map(m => m.user_id),
        status: 'scheduled'
      });

      if (error) throw error;

      toast.success('Reminder created!');
      setTitle('');
      setDescription('');
      setDate('');
      setTime('');
      setConditionType('none');
      setAllowedCompleters([]);
      onOpenChange(false);
      onCreated();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create reminder');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Create Reminder
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Take out the trash"
            />
          </div>

          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date" className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Date
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <Label htmlFor="time" className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> Time
              </Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Completion Condition</Label>
            <Select value={conditionType} onValueChange={(v: any) => setConditionType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No condition - anyone can complete</SelectItem>
                <SelectItem value="task_completed">Task must be completed first</SelectItem>
                <SelectItem value="expense_paid">Expense must be paid first</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {otherMembers.length > 0 && (
            <div>
              <Label className="mb-2 block">Who can mark this as done?</Label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {otherMembers.map((member) => (
                  <div key={member.user_id} className="flex items-center gap-2">
                    <Checkbox
                      id={member.user_id}
                      checked={allowedCompleters.length === 0 || allowedCompleters.includes(member.user_id)}
                      onCheckedChange={() => toggleCompleter(member.user_id)}
                    />
                    <label htmlFor={member.user_id} className="text-sm flex items-center gap-1 cursor-pointer">
                      <span>{member.avatar}</span>
                      <span>{member.display_name}</span>
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Leave all unchecked to allow everyone
              </p>
            </div>
          )}

          <Button
            onClick={handleCreate}
            disabled={isCreating || !title.trim() || !date || !time}
            className="w-full"
          >
            {isCreating ? 'Creating...' : 'Create Reminder'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
