import { useState, useEffect } from "react";
import { CheckCircle2, Circle, Clock, Plus, Calendar, Filter, Check, X, Loader2, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";
import { CreateTaskDialog } from "@/components/tasks/CreateTaskDialog";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { RejectCommentDialog } from "@/components/tasks/RejectCommentDialog";
import { EmptyState } from "@/components/empty-states/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigation } from "@/hooks/useNavigation";

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
  const [view, setView] = useState<"board" | "list">("list");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectingTaskId, setRejectingTaskId] = useState<string | null>(null);
  const { navigate, navigateToTab, goBack } = useNavigation();
  const { user, currentRoom } = useAuth();
  const { toast } = useToast();

  // Status counts for the summary
  const statusCounts = {
    todo: tasks.filter(t => t.status === 'pending' || t.status === 'accepted').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  };

  useEffect(() => {
    if (currentRoom) {
      fetchTasks();
      
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

  const handleTaskAction = async (taskId: string, action: 'accept' | 'start' | 'complete') => {
    setUpdatingTaskId(taskId);
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
        .eq('id', taskId);

      if (error) throw error;

      toast({
        title: action === 'accept' ? 'Task accepted!' : 
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

  const handleRejectClick = (taskId: string) => {
    setRejectingTaskId(taskId);
    setShowRejectDialog(true);
  };

  const handleRejectConfirm = async (comment: string) => {
    if (!rejectingTaskId) return;
    
    const { error } = await supabase
      .from('tasks')
      .update({ 
        status: 'rejected',
        rejection_comment: comment 
      })
      .eq('id', rejectingTaskId);

    if (error) throw error;

    toast({ title: 'Task rejected' });
    setRejectingTaskId(null);
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

  const needsApproval = (task: Task) => {
    return task.status === 'pending' && 
           task.assigned_to === user?.id && 
           task.created_by !== user?.id;
  };

  const openTaskDetail = (task: Task) => {
    setSelectedTask(task);
    setShowDetailSheet(true);
  };

  const rejectingTask = tasks.find(t => t.id === rejectingTaskId);

  // Group tasks by assignee for the "Assigned by People" section
  const myTasks = tasks.filter(t => t.assigned_to === user?.id);

  return (
    <div className="min-h-screen bg-background pb-32">
      <TopBar 
        title="Task Manager" 
        showBack={true}
        onBack={goBack}
        hint="Everything here is shared with your room ❤️"
        rightContent={
          <div className="flex gap-2">
            <Button variant="glass" size="iconSm" className="press-effect">
              <Calendar className="w-4 h-4" />
            </Button>
            <Button variant="glass" size="iconSm" className="press-effect">
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      {/* Status Summary Cards */}
      <div className="px-4 mb-4">
        <div className="bg-card rounded-2xl p-4 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">Task Name</span>
            <div className="flex gap-2">
              <Button variant="glass" size="iconSm" className="w-8 h-8">
                <Calendar className="w-4 h-4" />
              </Button>
              <Button variant="glass" size="iconSm" className="w-8 h-8">
                <Filter className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{statusCounts.todo}</p>
              <p className="text-xs text-muted-foreground">To Do</p>
            </div>
            <div className="bg-primary/10 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-primary">{statusCounts.inProgress}</p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </div>
            <div className="bg-mint/10 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-mint">{statusCounts.done}</p>
              <p className="text-xs text-muted-foreground">Done</p>
            </div>
          </div>
        </div>
      </div>

      {/* Assigned by People Section */}
      <div className="px-4 mb-4">
        <div className="bg-card rounded-2xl p-4 shadow-card">
          <h3 className="font-semibold text-foreground mb-3">Assigned by People</h3>
          <p className="text-sm text-muted-foreground mb-3">Created by you</p>
          
          {/* Status Filter Tabs */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {['To Do', 'In De', 'Prgees', 'Done'].map((status, idx) => (
              <button
                key={status}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                  idx === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Task List */}
          <div className="space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : myTasks.length === 0 ? (
              <EmptyState
                emoji="🌱"
                title="Looks peaceful here"
                description="No tasks yet! Add your first task and start getting things done together."
                actionLabel="Create your first task"
                onAction={() => setShowCreateDialog(true)}
              />
            ) : (
              myTasks.slice(0, 4).map((task, index) => {
                const StatusIcon = statusIcons[task.status];
                const isAssignedToMe = task.assigned_to === user?.id;
                const isUpdating = updatingTaskId === task.id;
                const showApprovalButtons = needsApproval(task);

                return (
                  <div
                    key={task.id}
                    onClick={() => openTaskDetail(task)}
                    className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl cursor-pointer hover:bg-muted/50 transition-colors animate-slide-up"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg">
                      {task.assignee_profile?.avatar || '😊'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "font-medium text-sm truncate",
                        task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"
                      )}>
                        {task.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {task.description || 'No description'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs px-2 py-1 rounded-full", priorityColors[task.priority])}>
                        {task.priority}
                      </span>
                      {task.due_date && (
                        <span className="text-xs text-muted-foreground">
                          {formatDueDate(task.due_date)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* All Tasks List */}
      <div className="px-4 space-y-3">
        <h3 className="font-semibold text-foreground px-1">All Tasks</h3>
        {tasks.filter(t => t.status !== 'rejected').map((task, index) => {
          const StatusIcon = statusIcons[task.status];
          const isAssignedToMe = task.assigned_to === user?.id;
          const isUpdating = updatingTaskId === task.id;
          const showApprovalButtons = needsApproval(task);

          return (
            <div
              key={task.id}
              className="bg-card rounded-2xl p-4 shadow-card animate-slide-up"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <div 
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => openTaskDetail(task)}
              >
                <StatusIcon className={cn(
                  "w-5 h-5",
                  task.status === 'done' ? 'text-mint' : 
                  task.status === 'in_progress' ? 'text-primary' : 'text-muted-foreground'
                )} />
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium truncate",
                    task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"
                  )}>
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
                  {showApprovalButtons && (
                    <>
                      <Button
                        size="sm"
                        className="flex-1 h-8 text-xs gap-1 bg-mint hover:bg-mint/90"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTaskAction(task.id, 'accept');
                        }}
                        disabled={isUpdating}
                      >
                        {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs gap-1 border-coral text-coral hover:bg-coral/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRejectClick(task.id);
                        }}
                        disabled={isUpdating}
                      >
                        <X className="w-3 h-3" />
                        Reject
                      </Button>
                    </>
                  )}
                  {task.status === 'accepted' && (
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTaskAction(task.id, 'start');
                      }}
                      disabled={isUpdating}
                    >
                      {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Start Working'}
                    </Button>
                  )}
                  {task.status === 'in_progress' && (
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs bg-mint hover:bg-mint/90"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTaskAction(task.id, 'complete');
                      }}
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
      </div>

      {/* FAB */}
      <button 
        onClick={() => setShowCreateDialog(true)}
        className="fixed bottom-24 right-4 w-14 h-14 bg-primary rounded-full shadow-lg flex items-center justify-center text-primary-foreground z-50 press-effect hover:bg-primary/90 transition-all"
      >
        <Plus className="w-6 h-6" />
      </button>

      <CreateTaskDialog 
        open={showCreateDialog} 
        onOpenChange={setShowCreateDialog}
        onTaskCreated={fetchTasks}
      />

      <TaskDetailSheet
        open={showDetailSheet}
        onOpenChange={setShowDetailSheet}
        task={selectedTask}
        onUpdate={fetchTasks}
      />

      <RejectCommentDialog
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        onConfirm={handleRejectConfirm}
        title="Reject Task"
        description={`Please provide a reason for rejecting "${rejectingTask?.title || 'this task'}".`}
      />

      <BottomNav activeTab="tasks" onTabChange={navigateToTab} />
    </div>
  );
};
