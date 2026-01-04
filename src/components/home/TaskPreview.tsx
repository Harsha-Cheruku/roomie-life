import { useState, useEffect } from "react";
import { CheckCircle2, Circle, Clock, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type TaskStatus = "pending" | "accepted" | "rejected" | "in_progress" | "done";
type Priority = "low" | "medium" | "high";

interface Task {
  id: string;
  title: string;
  assigned_to: string;
  created_by: string;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  assignee_profile?: {
    display_name: string;
    avatar: string;
  };
}

const priorityColors: Record<Priority, string> = {
  low: "bg-mint/20 text-mint",
  medium: "bg-accent/20 text-accent",
  high: "bg-coral/20 text-coral",
};

const statusIcons: Record<TaskStatus, React.ElementType> = {
  pending: Clock,
  accepted: Circle,
  rejected: X,
  in_progress: Clock,
  done: CheckCircle2,
};

export const TaskPreview = () => {
  const navigate = useNavigate();
  const { user, currentRoom } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusCounts, setStatusCounts] = useState({ pending: 0, in_progress: 0, done: 0 });
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (currentRoom) {
      fetchTasks();
    }
  }, [currentRoom]);

  const fetchTasks = async () => {
    if (!currentRoom) return;

    try {
      const { data: tasksData, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('room_id', currentRoom.id)
        .neq('status', 'rejected')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      // Get all tasks for counts
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('status')
        .eq('room_id', currentRoom.id)
        .neq('status', 'rejected');

      const counts = {
        pending: allTasks?.filter(t => t.status === 'pending' || t.status === 'accepted').length || 0,
        in_progress: allTasks?.filter(t => t.status === 'in_progress').length || 0,
        done: allTasks?.filter(t => t.status === 'done').length || 0,
      };
      setStatusCounts(counts);

      // Fetch profiles
      const userIds = [...new Set(tasksData?.map(t => t.assigned_to) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const tasksWithProfiles = tasksData?.map(task => ({
        ...task,
        assignee_profile: profileMap.get(task.assigned_to),
      })) || [];

      setTasks(tasksWithProfiles as Task[]);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTaskAction = async (taskId: string, action: 'accept' | 'reject') => {
    setUpdatingTaskId(taskId);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: action === 'accept' ? 'accepted' : 'rejected' })
        .eq('id', taskId);

      if (error) throw error;

      toast({
        title: action === 'accept' ? 'Task accepted!' : 'Task rejected',
      });

      fetchTasks();
    } catch (error) {
      console.error('Error updating task:', error);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const formatDueDate = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  // Only show accept/reject for tasks assigned by someone else
  const needsApproval = (task: Task) => {
    return task.status === 'pending' && 
           task.assigned_to === user?.id && 
           task.created_by !== user?.id;
  };

  if (isLoading) {
    return (
      <section className="px-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  return (
    <section className="px-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Tasks
        </h2>
        <button 
          onClick={() => navigate('/tasks')}
          className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          See Board
        </button>
      </div>

      {/* Status Pills */}
      <div className="flex gap-2 mb-4">
        {[
          { label: "To Do", count: statusCounts.pending, color: "bg-muted text-muted-foreground" },
          { label: "Doing", count: statusCounts.in_progress, color: "bg-accent/20 text-accent" },
          { label: "Done", count: statusCounts.done, color: "bg-mint/20 text-mint" },
        ].map((status) => (
          <div
            key={status.label}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold",
              status.color
            )}
          >
            {status.label} · {status.count}
          </div>
        ))}
      </div>

      {/* Task Cards */}
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No tasks yet. Create one from the Tasks page!
          </div>
        ) : (
          tasks.map((task, index) => {
            const StatusIcon = statusIcons[task.status];
            const isAssignedToMe = task.assigned_to === user?.id;
            const showApprovalButtons = needsApproval(task);
            const isUpdating = updatingTaskId === task.id;

            return (
              <div
                key={task.id}
                className={cn(
                  "bg-card rounded-2xl p-4 shadow-card animate-slide-up",
                  showApprovalButtons && "border-2 border-accent/50"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center gap-3">
                  <StatusIcon
                    className={cn(
                      "w-5 h-5 flex-shrink-0",
                      task.status === "done" ? "text-mint" :
                      task.status === "in_progress" ? "text-primary" :
                      task.status === "pending" ? "text-accent" :
                      "text-muted-foreground"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium truncate",
                        task.status === "done"
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      )}
                    >
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-lg">{task.assignee_profile?.avatar || '😊'}</span>
                      <span className="text-xs text-muted-foreground">
                        {task.assigned_to === user?.id ? 'You' : task.assignee_profile?.display_name}
                      </span>
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          priorityColors[task.priority]
                        )}
                      >
                        {task.priority}
                      </span>
                    </div>
                  </div>
                  {task.due_date && (
                    <div className="text-xs font-medium text-muted-foreground">
                      {formatDueDate(task.due_date)}
                    </div>
                  )}
                </div>

                {/* Accept/Reject buttons only for tasks assigned by others */}
                {showApprovalButtons && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs gap-1 bg-mint hover:bg-mint/90"
                      onClick={() => handleTaskAction(task.id, 'accept')}
                      disabled={isUpdating}
                    >
                      {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs gap-1 border-coral text-coral hover:bg-coral/10"
                      onClick={() => handleTaskAction(task.id, 'reject')}
                      disabled={isUpdating}
                    >
                      {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
