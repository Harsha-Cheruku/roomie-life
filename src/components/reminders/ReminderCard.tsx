import { useState } from 'react';
import { format } from 'date-fns';
import { Bell, BellOff, Check, Clock, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Reminder {
  id: string;
  title: string;
  description: string | null;
  remind_at: string;
  status: 'scheduled' | 'notified' | 'completed';
  condition_type: string | null;
  condition_ref_id: string | null;
  allowed_completers: string[];
  created_by: string;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ReminderCardProps {
  reminder: Reminder;
  currentUserId: string;
  memberProfiles: Record<string, { display_name: string; avatar: string }>;
  onUpdate: () => void;
}

export function ReminderCard({ reminder, currentUserId, memberProfiles, onUpdate }: ReminderCardProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isCreator = reminder.created_by === currentUserId;
  const canComplete = !isCreator && 
    (reminder.allowed_completers.length === 0 || reminder.allowed_completers.includes(currentUserId)) &&
    reminder.status !== 'completed';
  
  const isPast = new Date(reminder.remind_at) < new Date();
  const creatorProfile = memberProfiles[reminder.created_by];
  const completerProfile = reminder.completed_by ? memberProfiles[reminder.completed_by] : null;

  const handleComplete = async () => {
    if (reminder.condition_type && reminder.condition_type !== 'none') {
      // Check conditions
      if (reminder.condition_type === 'task_completed' && reminder.condition_ref_id) {
        const { data: task } = await supabase
          .from('tasks')
          .select('status')
          .eq('id', reminder.condition_ref_id)
          .single();
        
        if (task?.status !== 'done') {
          toast.error('The linked task must be completed first');
          return;
        }
      } else if (reminder.condition_type === 'expense_paid' && reminder.condition_ref_id) {
        const { data: expense } = await supabase
          .from('expenses')
          .select('status')
          .eq('id', reminder.condition_ref_id)
          .single();
        
        if (expense?.status !== 'settled') {
          toast.error('The linked expense must be settled first');
          return;
        }
      }
    }

    setIsCompleting(true);
    try {
      const { error } = await supabase
        .from('reminders')
        .update({
          status: 'completed',
          completed_by: currentUserId,
          completed_at: new Date().toISOString()
        })
        .eq('id', reminder.id);

      if (error) throw error;
      toast.success('Reminder marked as done!');
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete reminder');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('reminders')
        .delete()
        .eq('id', reminder.id);

      if (error) throw error;
      toast.success('Reminder deleted');
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete reminder');
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusColor = () => {
    switch (reminder.status) {
      case 'completed': return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'notified': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      default: return 'bg-primary/10 text-primary border-primary/20';
    }
  };

  const getStatusIcon = () => {
    switch (reminder.status) {
      case 'completed': return <Check className="h-3 w-3" />;
      case 'notified': return <Bell className="h-3 w-3" />;
      default: return <Clock className="h-3 w-3" />;
    }
  };

  return (
    <Card className={`transition-all ${reminder.status === 'completed' ? 'opacity-60' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Bell className={`h-4 w-4 ${reminder.status === 'completed' ? 'text-muted-foreground' : 'text-primary'}`} />
              <h3 className={`font-medium truncate ${reminder.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                {reminder.title}
              </h3>
            </div>
            
            {reminder.description && (
              <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                {reminder.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className={getStatusColor()}>
                {getStatusIcon()}
                <span className="ml-1 capitalize">{reminder.status}</span>
              </Badge>

              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(reminder.remind_at), 'MMM d, h:mm a')}
              </span>

              {creatorProfile && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {creatorProfile.avatar} {creatorProfile.display_name}
                </span>
              )}
            </div>

            {reminder.status === 'completed' && completerProfile && (
              <p className="text-xs text-green-600 mt-2">
                ✓ Completed by {completerProfile.avatar} {completerProfile.display_name}
                {reminder.completed_at && (
                  <span className="text-muted-foreground ml-1">
                    at {format(new Date(reminder.completed_at), 'h:mm a')}
                  </span>
                )}
              </p>
            )}

            {isPast && reminder.status === 'scheduled' && (
              <p className="text-xs text-amber-600 mt-2">
                ⏰ This reminder is overdue
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {canComplete && (
              <Button
                size="sm"
                onClick={handleComplete}
                disabled={isCompleting}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isCompleting ? '...' : <><Check className="h-4 w-4 mr-1" /> Done</>}
              </Button>
            )}

            {isCreator && reminder.status !== 'completed' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}

            {isCreator && reminder.status !== 'completed' && (
              <p className="text-xs text-muted-foreground text-center">
                (You'll be reminded)
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
