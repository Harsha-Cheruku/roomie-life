import { useState } from 'react';
import { Check, X, Loader2, Calendar, Clock, User, Flag, ArrowLeft, Play, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { RejectCommentDialog } from './RejectCommentDialog';

type TaskStatus = "pending" | "accepted" | "rejected" | "in_progress" | "done";
type Priority = "low" | "medium" | "high";

interface Task {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  created_by: string;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  reminder_time: string | null;
  rejection_comment?: string | null;
  created_at: string;
  assignee_profile?: {
    display_name: string;
    avatar: string;
  };
  creator_profile?: {
    display_name: string;
    avatar: string;
  };
}

interface TaskDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  onUpdate: () => void;
}

const priorityColors: Record<Priority, string> = {
  low: "bg-mint/20 text-mint",
  medium: "bg-accent/20 text-accent",
  high: "bg-coral/20 text-coral",
};

const statusColors: Record<TaskStatus, string> = {
  pending: "bg-accent/20 text-accent",
  accepted: "bg-muted text-muted-foreground",
  rejected: "bg-coral/20 text-coral",
  in_progress: "bg-primary/20 text-primary",
  done: "bg-mint/20 text-mint",
};

const statusLabels: Record<TaskStatus, string> = {
  pending: "Pending",
  accepted: "To Do",
  rejected: "Rejected",
  in_progress: "In Progress",
  done: "Done",
};

export const TaskDetailSheet = ({
  open,
  onOpenChange,
  task,
  onUpdate,
}: TaskDetailSheetProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [updatingAction, setUpdatingAction] = useState<string | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  if (!task) return null;

  const isAssignedToMe = task.assigned_to === user?.id;
  const isCreatedByMe = task.created_by === user?.id;
  const needsApproval = task.status === 'pending' && isAssignedToMe && !isCreatedByMe;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('en-IN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleTaskAction = async (action: 'accept' | 'start' | 'complete', comment?: string) => {
    setUpdatingAction(action);
    try {
      let newStatus: TaskStatus;
      switch (action) {
        case 'accept': newStatus = 'accepted'; break;
        case 'start': newStatus = 'in_progress'; break;
        case 'complete': newStatus = 'done'; break;
      }

      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', task.id);

      if (error) throw error;

      toast({
        title: action === 'accept' ? 'Task accepted!' : 
               action === 'start' ? 'Task started!' : 'Task completed!',
      });
      onUpdate();
    } catch (error) {
      console.error('Error updating task:', error);
      toast({
        title: 'Failed to update task',
        variant: 'destructive',
      });
    } finally {
      setUpdatingAction(null);
    }
  };

  const handleReject = async (comment: string) => {
    const { error } = await supabase
      .from('tasks')
      .update({ 
        status: 'rejected',
        rejection_comment: comment 
      })
      .eq('id', task.id);

    if (error) throw error;

    toast({ title: 'Task rejected' });
    onUpdate();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl overflow-hidden flex flex-col">
          <SheetHeader className="shrink-0 flex flex-row items-center gap-3 pb-2">
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <SheetTitle className="text-xl font-bold">Task Details</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pb-4">
            {/* Task Title & Status */}
            <div className="bg-card rounded-2xl p-5 shadow-card">
              <div className="flex items-start justify-between mb-3">
                <h2 className="text-xl font-bold text-foreground flex-1">{task.title}</h2>
                <Badge className={cn("ml-2", statusColors[task.status])}>
                  {statusLabels[task.status]}
                </Badge>
              </div>
              
              {task.description && (
                <p className="text-sm text-muted-foreground">{task.description}</p>
              )}
            </div>

            {/* Priority & Due Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card rounded-2xl p-4 shadow-card">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Flag className="w-4 h-4" />
                  <span className="text-sm">Priority</span>
                </div>
                <Badge className={priorityColors[task.priority]}>
                  {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                </Badge>
              </div>
              
              <div className="bg-card rounded-2xl p-4 shadow-card">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm">Due Date</span>
                </div>
                <p className="font-medium text-foreground">
                  {formatDate(task.due_date) || 'No due date'}
                </p>
              </div>
            </div>

            {/* Reminder */}
            {task.reminder_time && (
              <div className="bg-card rounded-2xl p-4 shadow-card">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Reminder</span>
                </div>
                <p className="font-medium text-foreground mt-1">
                  {formatDateTime(task.reminder_time)}
                </p>
              </div>
            )}

            {/* Assigned To */}
            <div className="bg-card rounded-2xl p-4 shadow-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <User className="w-4 h-4" />
                <span className="text-sm">Assigned To</span>
              </div>
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="text-lg bg-primary/20">
                    {task.assignee_profile?.avatar || '😊'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-foreground">
                    {isAssignedToMe ? 'You' : task.assignee_profile?.display_name || 'Unknown'}
                  </p>
                </div>
              </div>
            </div>

            {/* Created By */}
            <div className="bg-card rounded-2xl p-4 shadow-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <User className="w-4 h-4" />
                <span className="text-sm">Created By</span>
              </div>
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="text-lg bg-mint/20">
                    {task.creator_profile?.avatar || '😊'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-foreground">
                    {isCreatedByMe ? 'You' : task.creator_profile?.display_name || 'Unknown'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(task.created_at)}
                  </p>
                </div>
              </div>
            </div>

            {/* Rejection Comment */}
            {task.status === 'rejected' && task.rejection_comment && (
              <div className="bg-coral/10 border border-coral/30 rounded-2xl p-4">
                <p className="text-sm font-medium text-coral mb-1">Rejection Reason:</p>
                <p className="text-sm text-foreground">{task.rejection_comment}</p>
              </div>
            )}

            {/* Action Buttons */}
            {isAssignedToMe && task.status !== 'done' && task.status !== 'rejected' && (
              <div className="space-y-3 pt-2">
                {needsApproval && (
                  <div className="flex gap-3">
                    <Button
                      className="flex-1 h-12 gap-2 bg-mint hover:bg-mint/90"
                      onClick={() => handleTaskAction('accept')}
                      disabled={!!updatingAction}
                    >
                      {updatingAction === 'accept' ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Check className="w-5 h-5" />
                      )}
                      Accept Task
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-12 gap-2 border-coral text-coral hover:bg-coral/10"
                      onClick={() => setShowRejectDialog(true)}
                      disabled={!!updatingAction}
                    >
                      <X className="w-5 h-5" />
                      Reject
                    </Button>
                  </div>
                )}
                
                {task.status === 'accepted' && (
                  <Button
                    className="w-full h-12 gap-2"
                    onClick={() => handleTaskAction('start')}
                    disabled={!!updatingAction}
                  >
                    {updatingAction === 'start' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Play className="w-5 h-5" />
                    )}
                    Start Working
                  </Button>
                )}
                
                {task.status === 'in_progress' && (
                  <Button
                    className="w-full h-12 gap-2 bg-mint hover:bg-mint/90"
                    onClick={() => handleTaskAction('complete')}
                    disabled={!!updatingAction}
                  >
                    {updatingAction === 'complete' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5" />
                    )}
                    Mark as Done
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <RejectCommentDialog
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        onConfirm={handleReject}
        title="Reject Task"
        description={`Please provide a reason for rejecting "${task.title}". This will be sent to ${task.creator_profile?.display_name || 'the creator'}.`}
      />
    </>
  );
};
