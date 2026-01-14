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
import { useRoomMembers } from '@/hooks/useRoomMembers';
import { cn } from '@/lib/utils';
import { useCreateNotification } from '@/hooks/useCreateNotification';

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskCreated: () => void;
}

export const CreateTaskDialog = ({ open, onOpenChange, onTaskCreated }: CreateTaskDialogProps) => {
  const { user, currentRoom, isSoloMode } = useAuth();
  const { toast } = useToast();
  const { members } = useRoomMembers();
  const { createTaskNotification } = useCreateNotification();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-assign to self in solo mode
  useEffect(() => {
    if (isSoloMode && user && !assignedTo) {
      setAssignedTo(user.id);
    }
  }, [isSoloMode, user, assignedTo]);

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
      // Self-assigned tasks are auto-accepted
      const isSelfAssigned = assignedTo === user.id;
      const initialStatus = isSelfAssigned ? 'accepted' : 'pending';
      
      const { data: task, error } = await supabase
        .from('tasks')
        .insert({
          room_id: currentRoom.id,
          created_by: user.id,
          assigned_to: assignedTo,
          title: title.trim(),
          description: description.trim() || null,
          priority,
          status: initialStatus,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          reminder_time: reminderTime ? new Date(reminderTime).toISOString() : null,
        })
        .select()
        .single();

      if (error) throw error;

      // Create notification for assigned user (if not self-assigned)
      if (!isSelfAssigned && task) {
        await createTaskNotification({
          id: task.id,
          title: title.trim(),
          created_by: user.id,
          assigned_to: assignedTo,
        });
      }

      toast({
        title: 'Task created!',
        description: isSelfAssigned 
          ? 'Task added to your To Do list' 
          : 'The task has been assigned',
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
          {/* Title - First */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Task Name</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="mt-1 rounded-xl"
              autoFocus
            />
          </div>

          {/* Assign to - Hidden in Solo Mode */}
          {!isSoloMode && (
            <div>
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Users className="w-4 h-4" />
                Assign to
              </label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {members.map(member => (
                  <button
                    key={member.user_id}
                    onClick={() => setAssignedTo(member.user_id)}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-xl border transition-colors press-effect",
                      assignedTo === member.user_id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-primary/20">
                        {member.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 text-left text-sm truncate">
                      {member.user_id === user?.id ? 'Myself' : member.display_name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Solo Mode Info */}
          {isSoloMode && (
            <div className="bg-lavender/10 rounded-xl p-3 flex items-center gap-2">
              <span className="text-lavender text-sm">📝 Solo Mode: Task will be assigned to you</span>
            </div>
          )}

          {/* Priority - Third */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Priority</label>
            <div className="flex gap-2 mt-2">
              {priorityOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => setPriority(option.value)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition-colors press-effect",
                    priority === option.value ? option.color : 'border-border text-muted-foreground'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due Date - Fourth */}
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

          {/* Reminder - Fifth */}
          <div>
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Reminder
            </label>
            <Input
              type="datetime-local"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              className="mt-1 rounded-xl"
            />
          </div>

          {/* Description - Last (optional) */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Notes (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any extra details..."
              className="mt-1 rounded-xl resize-none"
              rows={3}
            />
          </div>
        </div>

        {/* Submit button */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t">
          <Button
            className="w-full h-14 rounded-xl text-base gap-2 press-effect"
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
