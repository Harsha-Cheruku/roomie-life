import { useState, useEffect } from "react";
import { CheckCircle2, Circle, Clock, Plus, Calendar, Filter, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { BottomNav } from "@/components/layout/BottomNav";
import { CreateTaskDialog } from "@/components/tasks/CreateTaskDialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

const columns: { id: TaskStatus; title: string; color: string; bgColor: string }[] = [
  { id: "pending", title: "Pending", color: "text-accent", bgColor: "bg-accent/10" },
  { id: "accepted", title: "To Do", color: "text-muted-foreground", bgColor: "bg-muted/50" },
  { id: "in_progress", title: "In Progress", color: "text-primary", bgColor: "bg-primary/10" },
  { id: "done", title: "Done", color: "text-mint", bgColor: "bg-mint/10" },
];

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

export const Tasks = () => {
  const [view, setView] = useState<"board" | "list">("board");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, currentRoom } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (currentRoom) {
      fetchTasks();
      
      // Subscribe to realtime updates
      const channel = supabase
        .channel('tasks-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tasks', filter: `room_id=eq.${currentRoom.id}` },
          () => fetchTasks()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentRoom]);

  const fetchTasks = async () => {
    if (!currentRoom) return;

    try {
      const { data: tasksData, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('room_id', currentRoom.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch profiles for assignees and creators
      const userIds = [...new Set([
        ...(tasksData?.map(t => t.assigned_to) || []),
        ...(tasksData?.map(t => t.created_by) || [])
      ])];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const tasksWithProfiles = tasksData?.map(task => ({
        ...task,
        assignee_profile: profileMap.get(task.assigned_to),
        creator_profile: profileMap.get(task.created_by),
      })) || [];

      setTasks(tasksWithProfiles as Task[]);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTaskAction = async (taskId: string, action: 'accept' | 'reject' | 'start' | 'complete') => {
    setUpdatingTaskId(taskId);
    try {
      let newStatus: TaskStatus;
      switch (action) {
        case 'accept': newStatus = 'accepted'; break;
        case 'reject': newStatus = 'rejected'; break;
        case 'start': newStatus = 'in_progress'; break;
        case 'complete': newStatus = 'done'; break;
      }

      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId);

      if (error) throw error;

      toast({
        title: action === 'accept' ? 'Task accepted!' : 
               action === 'reject' ? 'Task rejected' :
               action === 'start' ? 'Task started!' : 'Task completed!',
      });
    } catch (error) {
      console.error('Error updating task:', error);
      toast({
        title: 'Failed to update task',
        variant: 'destructive',
      });
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

  const handleTabChange = (tab: string) => {
    if (tab === 'home') navigate('/');
    else if (tab === 'tasks') navigate('/tasks');
    else if (tab === 'expenses') navigate('/expenses');
    else if (tab === 'storage') navigate('/storage');
    else if (tab === 'chat') navigate('/chat');
  };

  // Filter out rejected tasks for board view
  const boardTasks = tasks.filter(t => t.status !== 'rejected');

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-2xl font-bold text-foreground">Tasks</h1>
          <div className="flex gap-2">
            <Button variant="glass" size="iconSm">
              <Calendar className="w-4 h-4" />
            </Button>
            <Button variant="glass" size="iconSm">
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2 p-1 bg-muted rounded-xl">
          <button
            onClick={() => setView("board")}
            className={cn(
              "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all",
              view === "board" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
            )}
          >
            Board
          </button>
          <button
            onClick={() => setView("list")}
            className={cn(
              "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all",
              view === "list" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
            )}
          >
            List
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Board View */}
          {view === "board" && (
            <div className="px-4 overflow-x-auto">
              <div className="flex gap-4 pb-4" style={{ minWidth: "fit-content" }}>
                {columns.map((column) => {
                  const columnTasks = boardTasks.filter((t) => t.status === column.id);
                  return (
                    <div key={column.id} className="w-72 flex-shrink-0">
                      <div className={cn("rounded-2xl p-3", column.bgColor)}>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className={cn("font-semibold text-sm", column.color)}>
                            {column.title}
                          </h3>
                          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", column.bgColor, column.color)}>
                            {columnTasks.length}
                          </span>
                        </div>

                        <div className="space-y-3">
                          {columnTasks.map((task, index) => {
                            const StatusIcon = statusIcons[task.status];
                            const isAssignedToMe = task.assigned_to === user?.id;
                            const isUpdating = updatingTaskId === task.id;
                            
                            return (
                              <div
                                key={task.id}
                                className="bg-card rounded-xl p-3 shadow-card animate-slide-up"
                                style={{ animationDelay: `${index * 50}ms` }}
                              >
                                <div className="flex items-start gap-2 mb-2">
                                  <StatusIcon className={cn("w-4 h-4 mt-0.5", column.color)} />
                                  <p className="text-sm font-medium text-foreground flex-1">
                                    {task.title}
                                  </p>
                                </div>
                                
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">{task.assignee_profile?.avatar || '😊'}</span>
                                    <span className={cn("text-xs px-2 py-0.5 rounded-full", priorityColors[task.priority])}>
                                      {task.priority}
                                    </span>
                                  </div>
                                  {task.due_date && (
                                    <span className="text-xs text-muted-foreground">
                                      {formatDueDate(task.due_date)}
                                    </span>
                                  )}
                                </div>

                                {/* Action buttons for assigned user */}
                                {isAssignedToMe && (
                                  <div className="flex gap-2 pt-2 border-t border-border/50">
                                    {task.status === 'pending' && (
                                      <>
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
                                      </>
                                    )}
                                    {task.status === 'accepted' && (
                                      <Button
                                        size="sm"
                                        className="w-full h-8 text-xs"
                                        onClick={() => handleTaskAction(task.id, 'start')}
                                        disabled={isUpdating}
                                      >
                                        {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Start Working'}
                                      </Button>
                                    )}
                                    {task.status === 'in_progress' && (
                                      <Button
                                        size="sm"
                                        className="w-full h-8 text-xs bg-mint hover:bg-mint/90"
                                        onClick={() => handleTaskAction(task.id, 'complete')}
                                        disabled={isUpdating}
                                      >
                                        {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3 mr-1" /> Mark Done</>}
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {column.id === 'pending' && (
                            <button 
                              onClick={() => setShowCreateDialog(true)}
                              className="w-full py-3 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                            >
                              <Plus className="w-4 h-4" />
                              Add Task
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* List View */}
          {view === "list" && (
            <div className="px-4 space-y-3">
              {tasks.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No tasks yet</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => setShowCreateDialog(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Task
                  </Button>
                </div>
              ) : (
                tasks.map((task, index) => {
                  const StatusIcon = statusIcons[task.status];
                  const column = columns.find((c) => c.id === task.status) || columns[0];
                  const isAssignedToMe = task.assigned_to === user?.id;
                  const isUpdating = updatingTaskId === task.id;

                  return (
                    <div
                      key={task.id}
                      className="bg-card rounded-2xl p-4 shadow-card animate-slide-up"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <div className="flex items-center gap-3">
                        <StatusIcon className={cn("w-5 h-5", column.color)} />
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-medium truncate", task.status === "done" ? "line-through text-muted-foreground" : "text-foreground")}>
                            {task.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-lg">{task.assignee_profile?.avatar || '😊'}</span>
                            <span className="text-xs text-muted-foreground">
                              {task.assigned_to === user?.id ? 'You' : task.assignee_profile?.display_name}
                            </span>
                            <span className={cn("text-xs px-2 py-0.5 rounded-full", priorityColors[task.priority])}>
                              {task.priority}
                            </span>
                          </div>
                        </div>
                        {task.due_date && (
                          <span className="text-xs text-muted-foreground">{formatDueDate(task.due_date)}</span>
                        )}
                      </div>

                      {/* Action buttons */}
                      {isAssignedToMe && task.status !== 'done' && task.status !== 'rejected' && (
                        <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
                          {task.status === 'pending' && (
                            <>
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
                            </>
                          )}
                          {task.status === 'accepted' && (
                            <Button
                              size="sm"
                              className="w-full h-8 text-xs"
                              onClick={() => handleTaskAction(task.id, 'start')}
                              disabled={isUpdating}
                            >
                              {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Start Working'}
                            </Button>
                          )}
                          {task.status === 'in_progress' && (
                            <Button
                              size="sm"
                              className="w-full h-8 text-xs bg-mint hover:bg-mint/90"
                              onClick={() => handleTaskAction(task.id, 'complete')}
                              disabled={isUpdating}
                            >
                              {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3 mr-1" /> Mark Done</>}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              <Button 
                variant="outline" 
                className="w-full mt-4" 
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Task
              </Button>
            </div>
          )}
        </>
      )}

      <CreateTaskDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onTaskCreated={fetchTasks}
      />

      <BottomNav activeTab="tasks" onTabChange={handleTabChange} />
    </div>
  );
};
