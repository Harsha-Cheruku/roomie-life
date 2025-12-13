import { useState, useEffect } from 'react';
import { Plus, Calendar, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface RoomMember {
  user_id: string;
  profile: {
    display_name: string;
    avatar: string;
  };
}

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskCreated: () => void;
}

export const CreateTaskDialog = ({ open, onOpenChange, onTaskCreated }: CreateTaskDialogProps) => {
  const { user, currentRoom } = useAuth();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (currentRoom && open) {
      fetchRoomMembers();
    }
  }, [currentRoom, open]);

  const fetchRoomMembers = async () => {
    if (!currentRoom) return;

    const { data, error } = await supabase
      .from('room_members')
      .select(`
        user_id,
        profiles:user_id (
          display_name,
          avatar
        )
      `)
      .eq('room_id', currentRoom.id);

    if (error) {
      console.error('Error fetching room members:', error);
      return;
    }

    const members = data?.map((member: any) => ({
      user_id: member.user_id,
      profile: {
        display_name: member.profiles?.display_name || 'Unknown',
        avatar: member.profiles?.avatar || '😊',
      },
    })) || [];

    setRoomMembers(members);
  };

  const handleSubmit = async () => {
    if (!user || !currentRoom || !title.trim() || !assignedTo) {
      toast({
        title: 'Missing information',
        description: 'Please fill in the title and assign to someone',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .insert({
          room_id: currentRoom.id,
          created_by: user.id,
          assigned_to: assignedTo,
          title: title.trim(),
          description: description.trim() || null,
          priority,
          status: 'pending',
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          reminder_time: reminderTime ? new Date(reminderTime).toISOString() : null,
        });

      if (error) throw error;

      toast({
        title: 'Task created!',
        description: 'The task has been assigned',
      });

      // Reset form
      setTitle('');
      setDescription('');
      setAssignedTo(null);
      setPriority('medium');
      setDueDate('');
      setReminderTime('');
      
      onTaskCreated();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating task:', error);
      toast({
        title: 'Failed to create task',
        description: 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const priorityOptions: { value: 'low' | 'medium' | 'high'; label: string; color: string }[] = [
    { value: 'low', label: 'Low', color: 'bg-mint/20 text-mint border-mint/50' },
    { value: 'medium', label: 'Medium', color: 'bg-accent/20 text-accent border-accent/50' },
    { value: 'high', label: 'High', color: 'bg-coral/20 text-coral border-coral/50' },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold">Create Task</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="mt-1 rounded-xl"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Description (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details..."
              className="mt-1 rounded-xl resize-none"
              rows={3}
            />
          </div>

          {/* Assign to */}
          <div>
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Users className="w-4 h-4" />
              Assign to
            </label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {roomMembers.map(member => (
                <button
                  key={member.user_id}
                  onClick={() => setAssignedTo(member.user_id)}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-xl border transition-colors",
                    assignedTo === member.user_id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-primary/20">
                      {member.profile.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-left text-sm truncate">
                    {member.user_id === user?.id ? 'You' : member.profile.display_name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Priority</label>
            <div className="flex gap-2 mt-2">
              {priorityOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => setPriority(option.value)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition-colors",
                    priority === option.value ? option.color : 'border-border text-muted-foreground'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Due Date
            </label>
            <Input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 rounded-xl"
            />
          </div>

          {/* Reminder */}
          <div>
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Reminder Notification
            </label>
            <Input
              type="datetime-local"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              className="mt-1 rounded-xl"
            />
          </div>
        </div>

        {/* Submit button */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t">
          <Button
            className="w-full h-14 rounded-xl text-base gap-2"
            onClick={handleSubmit}
            disabled={isSubmitting || !title.trim() || !assignedTo}
          >
            <Plus className="w-5 h-5" />
            {isSubmitting ? 'Creating...' : 'Create Task'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
