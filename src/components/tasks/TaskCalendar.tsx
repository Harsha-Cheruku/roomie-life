import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, isSameDay, startOfDay, addHours } from "date-fns";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  assigned_to: string;
  created_by: string;
  assignee_profile?: {
    display_name: string;
    avatar: string;
  };
}

interface TaskCalendarProps {
  onCreateTask?: (date: Date) => void;
  onTaskClick?: (task: Task) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const TaskCalendar = ({ onCreateTask, onTaskClick }: TaskCalendarProps) => {
  const { user, currentRoom, isSoloMode } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<"calendar" | "planner">("calendar");

  useEffect(() => {
    if (currentRoom) {
      fetchTasks();
    }
  }, [currentRoom, selectedDate]);

  const fetchTasks = async () => {
    if (!currentRoom) return;

    const { data: tasksData, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("room_id", currentRoom.id)
      .order("due_date", { ascending: true });

    if (error) {
      console.error("Error fetching tasks:", error);
      return;
    }

    // Fetch profiles
    const userIds = [...new Set([
      ...(tasksData?.map(t => t.assigned_to) || []),
      ...(tasksData?.map(t => t.created_by) || [])
    ])];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar")
      .in("user_id", userIds);

    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

    const tasksWithProfiles = tasksData?.map(task => ({
      ...task,
      assignee_profile: profileMap.get(task.assigned_to),
    })) || [];

    // Filter for solo mode
    const filteredTasks = isSoloMode
      ? tasksWithProfiles.filter(t => t.assigned_to === user?.id || t.created_by === user?.id)
      : tasksWithProfiles;

    setTasks(filteredTasks);
  };

  // Get tasks for a specific date
  const getTasksForDate = (date: Date) => {
    return tasks.filter(task => {
      if (!task.due_date) return false;
      return isSameDay(new Date(task.due_date), date);
    });
  };

  // Get tasks for selected date
  const selectedDateTasks = getTasksForDate(selectedDate);

  // Get tasks by hour for day planner
  const getTasksForHour = (hour: number) => {
    return selectedDateTasks.filter(task => {
      if (!task.due_date) return false;
      const taskHour = new Date(task.due_date).getHours();
      return taskHour === hour;
    });
  };

  // Dates with tasks (for calendar highlighting)
  const datesWithTasks = tasks
    .filter(t => t.due_date)
    .map(t => startOfDay(new Date(t.due_date!)));

  const priorityColors: Record<string, string> = {
    low: "bg-mint/20 text-mint",
    medium: "bg-accent/20 text-accent",
    high: "bg-coral/20 text-coral",
  };

  const statusColors: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    accepted: "bg-primary/20 text-primary",
    in_progress: "bg-accent/20 text-accent",
    done: "bg-mint/20 text-mint",
    rejected: "bg-coral/20 text-coral",
  };

  return (
    <div className="space-y-4">
      {/* View Toggle */}
      <div className="flex gap-2 px-4">
        <Button
          variant={view === "calendar" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("calendar")}
          className="flex-1"
        >
          <CalendarIcon className="w-4 h-4 mr-2" />
          Month View
        </Button>
        <Button
          variant={view === "planner" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("planner")}
          className="flex-1"
        >
          <Clock className="w-4 h-4 mr-2" />
          Day Planner
        </Button>
      </div>

      {view === "calendar" ? (
        <div className="px-4">
          <Card>
            <CardContent className="p-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                className="rounded-md border-0"
                modifiers={{
                  hasTasks: datesWithTasks,
                }}
                modifiersStyles={{
                  hasTasks: {
                    fontWeight: "bold",
                    textDecoration: "underline",
                    textDecorationColor: "hsl(var(--primary))",
                  },
                }}
              />
            </CardContent>
          </Card>

          {/* Tasks for Selected Date */}
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>{format(selectedDate, "EEEE, MMMM d")}</span>
                <Badge variant="secondary">
                  {selectedDateTasks.length} task{selectedDateTasks.length !== 1 ? "s" : ""}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDateTasks.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-muted-foreground text-sm mb-3">No tasks scheduled</p>
                  {onCreateTask && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onCreateTask(selectedDate)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Task
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedDateTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => onTaskClick?.(task)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm">
                        {task.assignee_profile?.avatar || "😊"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "font-medium text-sm truncate",
                          task.status === "done" && "line-through text-muted-foreground"
                        )}>
                          {task.title}
                        </p>
                        {task.due_date && (
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(task.due_date), "h:mm a")}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Badge className={cn("text-xs", priorityColors[task.priority])}>
                          {task.priority}
                        </Badge>
                        <Badge className={cn("text-xs", statusColors[task.status])}>
                          {task.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Day Planner View */
        <div className="px-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedDate(prev => new Date(prev.getTime() - 86400000))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <CardTitle className="text-lg">{format(selectedDate, "EEEE, MMMM d")}</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedDate(prev => new Date(prev.getTime() + 86400000))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <div className="divide-y divide-border">
                  {HOURS.map((hour) => {
                    const hourTasks = getTasksForHour(hour);
                    const timeLabel = format(addHours(startOfDay(selectedDate), hour), "h a");
                    const isCurrentHour = new Date().getHours() === hour && isSameDay(new Date(), selectedDate);

                    return (
                      <div
                        key={hour}
                        className={cn(
                          "flex min-h-[60px]",
                          isCurrentHour && "bg-primary/5"
                        )}
                      >
                        <div className="w-16 p-2 text-right text-xs text-muted-foreground shrink-0 border-r">
                          {timeLabel}
                        </div>
                        <div className="flex-1 p-2 space-y-1">
                          {hourTasks.map((task) => (
                            <button
                              key={task.id}
                              onClick={() => onTaskClick?.(task)}
                              className={cn(
                                "w-full text-left p-2 rounded-lg text-sm transition-colors",
                                priorityColors[task.priority]
                              )}
                            >
                              <p className="font-medium truncate">{task.title}</p>
                              <p className="text-xs opacity-70">
                                {task.assignee_profile?.display_name}
                              </p>
                            </button>
                          ))}
                          {hourTasks.length === 0 && onCreateTask && (
                            <button
                              onClick={() => {
                                const dateWithHour = addHours(startOfDay(selectedDate), hour);
                                onCreateTask(dateWithHour);
                              }}
                              className="w-full h-full min-h-[40px] rounded-lg border-2 border-dashed border-muted hover:border-primary/50 transition-colors flex items-center justify-center text-xs text-muted-foreground hover:text-primary"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Add
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
