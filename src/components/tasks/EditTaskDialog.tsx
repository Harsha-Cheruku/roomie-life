import { useState, useEffect } from 'react';
import { Save, Loader2, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface EditTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: {
    id: string;
    title: string;
    description: string | null;
    priority: 'low' | 'medium' | 'high';
    due_date: string | null;
    reminder_time: string | null;
  } | null;
  onComplete: () => void;
}

export const EditTaskDialog = ({ 
  open, 
  onOpenChange, 
  task,
  onComplete 
}: EditTaskDialogProps) => {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (task && open) {
      setTitle(task.title);
      setDescription(task.description || '');
      setPriority(task.priority);
      // Convert ISO to datetime-local format
      if (task.due_date) {
        const date = new Date(task.due_date);
        setDueDate(date.toISOString().slice(0, 16));
      } else {
        setDueDate('');
      }
      if (task.reminder_time) {
        const date = new Date(task.reminder_time);
        setReminderTime(date.toISOString().slice(0, 16));
      } else {
        setReminderTime('');
      }
    }
  }, [task, open]);

  const handleSave = async () => {
    if (!task || !title.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please fill in the title',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          reminder_time: reminderTime ? new Date(reminderTime).toISOString() : null,
        })
        .eq('id', task.id);

      if (error) throw error;

      toast({ title: 'Task updated! ✓' });
      onComplete();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating task:', error);
      toast({
        title: 'Failed to update',
        description: 'Could not update the task. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const priorityOptions: { value: 'low' | 'medium' | 'high'; label: string; color: string }[] = [
    { value: 'low', label: 'Low', color: 'bg-mint/20 text-mint border-mint/50' },
    { value: 'medium', label: 'Medium', color: 'bg-accent/20 text-accent border-accent/50' },
    { value: 'high', label: 'High', color: 'bg-coral/20 text-coral border-coral/50' },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl overflow-hidden flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="text-xl font-bold">Edit Task</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-4 pb-4">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Task Name</label>
            <Input 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 rounded-xl h-12"
              placeholder="What needs to be done?"
            />
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
                    "flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition-colors press-effect",
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
              Reminder
            </label>
            <Input
              type="datetime-local"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              className="mt-1 rounded-xl"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Notes (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 rounded-xl resize-none"
              rows={3}
              placeholder="Add any extra details..."
            />
          </div>
        </div>

        {/* Submit button */}
        <div className="shrink-0 p-4 border-t">
          <Button
            className="w-full h-12 rounded-xl text-base gap-2 press-effect"
            onClick={handleSave}
            disabled={isSaving || !title.trim()}
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
