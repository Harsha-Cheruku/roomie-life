import { useState, useMemo } from 'react';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Clock, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  priority: string;
}

interface SoloDayPlannerProps {
  tasks: Task[];
  onAddTask: () => void;
  onTaskClick: (task: Task) => void;
}

export const SoloDayPlanner = ({ tasks, onAddTask, onTaskClick }: SoloDayPlannerProps) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const tasksForDate = useMemo(() => {
    return tasks.filter(task => {
      if (!task.due_date) return false;
      return isSameDay(new Date(task.due_date), selectedDate);
    });
  }, [tasks, selectedDate]);

  const getTasksForDay = (date: Date) => {
    return tasks.filter(task => {
      if (!task.due_date) return false;
      return isSameDay(new Date(task.due_date), date);
    });
  };

  const prevWeek = () => setWeekStart(addDays(weekStart, -7));
  const nextWeek = () => setWeekStart(addDays(weekStart, 7));

  const priorityColors: Record<string, string> = {
    low: 'bg-mint/20 border-mint',
    medium: 'bg-accent/20 border-accent',
    high: 'bg-coral/20 border-coral',
  };

  return (
    <div className="space-y-4">
      {/* Week Navigation */}
      <div className="flex items-center justify-between px-2">
        <Button variant="ghost" size="icon" onClick={prevWeek}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="font-medium text-sm">
          {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')}
        </span>
        <Button variant="ghost" size="icon" onClick={nextWeek}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Week Calendar Strip */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day) => {
          const dayTasks = getTasksForDay(day);
          const isSelected = isSameDay(day, selectedDate);
          const isDayToday = isToday(day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDate(day)}
              className={cn(
                "flex flex-col items-center p-2 rounded-xl transition-all",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : isDayToday
                    ? "bg-primary/20"
                    : "bg-muted/50 hover:bg-muted"
              )}
            >
              <span className="text-xs font-medium">{format(day, 'EEE')}</span>
              <span className={cn(
                "text-lg font-bold",
                isSelected ? "text-primary-foreground" : ""
              )}>
                {format(day, 'd')}
              </span>
              {dayTasks.length > 0 && (
                <div className="flex gap-0.5 mt-1">
                  {dayTasks.slice(0, 3).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        isSelected ? "bg-primary-foreground/70" : "bg-primary"
                      )}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Day Tasks */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">
            {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEEE, MMM d')}
          </h3>
          <Button size="sm" variant="ghost" onClick={onAddTask} className="text-primary">
            <Plus className="w-4 h-4 mr-1" />
            Add Task
          </Button>
        </div>

        {tasksForDate.length === 0 ? (
          <div className="text-center py-8 bg-muted/30 rounded-2xl">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-muted-foreground text-sm">No tasks for this day</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={onAddTask}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add a task
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {tasksForDate.map((task) => (
              <div
                key={task.id}
                onClick={() => onTaskClick(task)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors border-l-4",
                  priorityColors[task.priority] || 'bg-muted/50 border-muted',
                  task.status === 'done' && "opacity-60"
                )}
              >
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center",
                  task.status === 'done' ? "bg-mint text-white" : "bg-muted"
                )}>
                  {task.status === 'done' && <Check className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "font-medium truncate",
                    task.status === 'done' && "line-through"
                  )}>
                    {task.title}
                  </p>
                  {task.due_date && (
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(task.due_date), 'h:mm a')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
