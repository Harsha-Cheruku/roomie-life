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
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { format, isSameDay, startOfDay, addHours } from "date-fns";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  reminder_time: string | null;
  created_at: string;
  assigned_to: string;
  created_by: string;
  assignee_profile?: {
    display_name: string;
    avatar: string;
  };
  creator_profile?: {
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
  const [showCreatedTasks, setShowCreatedTasks] = useState(false);
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

    const filteredTasks = isSoloMode
      ? tasksWithProfiles.filter(t => t.assigned_to === user?.id || t.created_by === user?.id)
      : tasksWithProfiles;

    setTasks(filteredTasks);
  };

  const getTaskScheduledDate = (task: Task): Date | null => {
    const dateValue = task.due_date || task.reminder_time;
    return dateValue ? new Date(dateValue) : null;
  };

  const getTasksForDate = (date: Date) => {
    return tasks.filter(task => {
      const scheduledDate = getTaskScheduledDate(task);
      // Tasks without any date show on today
      if (!scheduledDate) return isSameDay(date, new Date());
      return isSameDay(scheduledDate, date);
    });
  };

  const getTasksCreatedOnDate = (date: Date) => {
    return tasks.filter(task => {
      return isSameDay(new Date(task.created_at), date);
    });
  };

  const selectedDateTasks = getTasksForDate(selectedDate);
  const createdOnDateTasks = getTasksCreatedOnDate(selectedDate);

  // Get tasks for a specific hour in the day planner
  // Tasks show at their actual due/reminder hour. Date-only tasks (midnight) show at 9 AM.
  const getTasksForHour = (hour: number) => {
    return selectedDateTasks.filter(task => {
      const taskDate = getTaskScheduledDate(task);
      if (!taskDate) return hour === 9;

      const taskHour = taskDate.getHours();
      const taskMinutes = taskDate.getMinutes();
      const taskSeconds = taskDate.getSeconds();

      if (taskHour === 0 && taskMinutes === 0 && taskSeconds === 0) {
        return hour === 9;
      }

      return taskHour === hour;
    });
  };

  const datesWithDueTasks = tasks
    .map(getTaskScheduledDate)
    .filter((date): date is Date => Boolean(date))
    .map((date) => startOfDay(date));

  const datesWithCreatedTasks = tasks
    .map(t => startOfDay(new Date(t.created_at)));

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
                    hasDueTasks: datesWithDueTasks,
                    hasCreatedTasks: datesWithCreatedTasks,
                  }}
                  modifiersStyles={{
                    hasDueTasks: {
                      fontWeight: "bold",
                      textDecoration: "underline",
                      textDecorationColor: "hsl(var(--primary))",
                    },
                    hasCreatedTasks: {
                      backgroundColor: "hsl(var(--accent) / 0.2)",
                      borderRadius: "9999px",
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
                <div className="flex gap-1">
                  <Badge variant="secondary">
                    {selectedDateTasks.length} due
                  </Badge>
                  {createdOnDateTasks.length > 0 && (
                    <Badge variant="outline" className="bg-accent/10">
                      {createdOnDateTasks.length} created
                    </Badge>
                  )}
                </div>
              </CardTitle>
              {createdOnDateTasks.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={() => setShowCreatedTasks(!showCreatedTasks)}
                >
                  {showCreatedTasks ? "Show Due Tasks" : "Show Tasks Created This Day"}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {(() => {
                const displayTasks = showCreatedTasks ? createdOnDateTasks : selectedDateTasks;
                const emptyMessage = showCreatedTasks 
                  ? "No tasks created on this date" 
                  : "No tasks due on this date";
                
                return displayTasks.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-muted-foreground text-sm mb-3">{emptyMessage}</p>
                    {onCreateTask && !showCreatedTasks && (
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
                    {displayTasks.map((task) => (
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
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            {getTaskScheduledDate(task) && (
                              <span>Due: {format(getTaskScheduledDate(task)!, "h:mm a")}</span>
                            )}
                            {showCreatedTasks && (
                              <span>Created: {format(new Date(task.created_at), "h:mm a")}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-wrap justify-end">
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
                );
              })()}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Day Planner View - Teams Meeting Style */
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
              {/* Today's summary */}
              <div className="flex gap-2 mt-2">
                <Badge variant="secondary">
                  {selectedDateTasks.length} task{selectedDateTasks.length !== 1 ? 's' : ''} today
                </Badge>
                {isSameDay(selectedDate, new Date()) && (
                  <Badge className="bg-primary/20 text-primary">Today</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]" id="day-planner-scroll">
                <div className="relative">
                  {/* Current time indicator line */}
                  {isSameDay(selectedDate, new Date()) && (
                    <CurrentTimeLine />
                  )}
                  <div className="divide-y divide-border">
                    {HOURS.map((hour) => {
                      const hourTasks = getTasksForHour(hour);
                      const timeLabel = format(addHours(startOfDay(selectedDate), hour), "h a");
                      const isCurrentHour = new Date().getHours() === hour && isSameDay(new Date(), selectedDate);
                      const isPastHour = isSameDay(selectedDate, new Date()) && hour < new Date().getHours();

                      return (
                        <div
                          key={hour}
                          id={`hour-${hour}`}
                          className={cn(
                            "flex min-h-[64px] relative",
                            isCurrentHour && "bg-primary/5 border-l-2 border-l-primary",
                            isPastHour && "opacity-60"
                          )}
                        >
                          <div className={cn(
                            "w-16 p-2 text-right text-xs shrink-0 border-r",
                            isCurrentHour ? "text-primary font-bold" : "text-muted-foreground"
                          )}>
                            {timeLabel}
                          </div>
                          <div className="flex-1 p-2 space-y-1">
                            {hourTasks.map((task) => (
                              <button
                                key={task.id}
                                onClick={() => onTaskClick?.(task)}
                                className={cn(
                                  "w-full text-left p-2.5 rounded-lg text-sm transition-colors border-l-3",
                                  task.status === "done" 
                                    ? "bg-mint/10 border-l-mint line-through opacity-70" 
                                    : task.status === "in_progress"
                                    ? "bg-accent/10 border-l-accent"
                                    : priorityColors[task.priority]
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-medium truncate">{task.title}</p>
                                  <Badge className={cn("text-[10px] shrink-0", statusColors[task.status])}>
                                    {task.status.replace("_", " ")}
                                  </Badge>
                                </div>
                                <p className="text-xs opacity-70 mt-0.5 flex items-center gap-1.5">
                                  <ProfileAvatar avatar={task.assignee_profile?.avatar} size="xs" />
                                  <span className="truncate">{task.assignee_profile?.display_name}</span>
                                  {getTaskScheduledDate(task) && ` · ${format(getTaskScheduledDate(task)!, "h:mm a")}`}
                                </p>
                              </button>
                            ))}
                            {hourTasks.length === 0 && onCreateTask && (
                              <button
                                onClick={() => {
                                  const dateWithHour = addHours(startOfDay(selectedDate), hour);
                                  onCreateTask(dateWithHour);
                                }}
                                className="w-full h-full min-h-[40px] rounded-lg border-2 border-dashed border-transparent hover:border-primary/30 transition-colors flex items-center justify-center text-xs text-muted-foreground hover:text-primary"
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
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

/** Red line indicating current time position in the day planner */
const CurrentTimeLine = () => {
  const [position, setPosition] = useState(0);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
      // Each hour row = 64px min height
      const px = (minutesSinceMidnight / 60) * 64;
      setPosition(px);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="absolute left-0 right-0 z-10 pointer-events-none flex items-center"
      style={{ top: `${position}px` }}
    >
      <div className="w-16 flex justify-end pr-1">
        <div className="w-3 h-3 rounded-full bg-destructive" />
      </div>
      <div className="flex-1 h-0.5 bg-destructive" />
    </div>
  );
};
