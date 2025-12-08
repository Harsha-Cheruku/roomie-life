import { useState } from "react";
import { CheckCircle2, Circle, Clock, Plus, Calendar, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TaskStatus = "todo" | "doing" | "done";
type Priority = "low" | "medium" | "high";

interface Task {
  id: string;
  title: string;
  assignee: string;
  avatar: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
}

const mockTasks: Task[] = [
  { id: "1", title: "Buy groceries for the week", assignee: "Alex", avatar: "🎮", status: "doing", priority: "high", dueDate: "Today" },
  { id: "2", title: "Pay electricity bill", assignee: "You", avatar: "😎", status: "todo", priority: "high", dueDate: "Tomorrow" },
  { id: "3", title: "Clean the kitchen", assignee: "Sam", avatar: "🎵", status: "done", priority: "medium", dueDate: "Done" },
  { id: "4", title: "Fix WiFi router", assignee: "Jordan", avatar: "📚", status: "todo", priority: "medium", dueDate: "Wed" },
  { id: "5", title: "Take out trash", assignee: "Alex", avatar: "🎮", status: "doing", priority: "low", dueDate: "Today" },
  { id: "6", title: "Water the plants", assignee: "Sam", avatar: "🎵", status: "done", priority: "low", dueDate: "Done" },
  { id: "7", title: "Organize living room", assignee: "You", avatar: "😎", status: "todo", priority: "low", dueDate: "Sat" },
];

const columns: { id: TaskStatus; title: string; color: string; bgColor: string }[] = [
  { id: "todo", title: "To Do", color: "text-muted-foreground", bgColor: "bg-muted/50" },
  { id: "doing", title: "In Progress", color: "text-accent", bgColor: "bg-accent/10" },
  { id: "done", title: "Done", color: "text-mint", bgColor: "bg-mint/10" },
];

const priorityColors: Record<Priority, string> = {
  low: "bg-mint/20 text-mint",
  medium: "bg-accent/20 text-accent",
  high: "bg-coral/20 text-coral",
};

const statusIcons: Record<TaskStatus, React.ElementType> = {
  todo: Circle,
  doing: Clock,
  done: CheckCircle2,
};

export const Tasks = () => {
  const [view, setView] = useState<"board" | "list">("board");

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

      {/* Board View */}
      {view === "board" && (
        <div className="px-4 overflow-x-auto">
          <div className="flex gap-4 pb-4" style={{ minWidth: "fit-content" }}>
            {columns.map((column) => {
              const columnTasks = mockTasks.filter((t) => t.status === column.id);
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
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{task.avatar}</span>
                                <span className={cn("text-xs px-2 py-0.5 rounded-full", priorityColors[task.priority])}>
                                  {task.priority}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">{task.dueDate}</span>
                            </div>
                          </div>
                        );
                      })}

                      <button className="w-full py-3 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2">
                        <Plus className="w-4 h-4" />
                        Add Task
                      </button>
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
          {mockTasks.map((task, index) => {
            const StatusIcon = statusIcons[task.status];
            const column = columns.find((c) => c.id === task.status)!;
            return (
              <div
                key={task.id}
                className="bg-card rounded-2xl p-4 shadow-card flex items-center gap-3 animate-slide-up"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <StatusIcon className={cn("w-5 h-5", column.color)} />
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium truncate", task.status === "done" ? "line-through text-muted-foreground" : "text-foreground")}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-lg">{task.avatar}</span>
                    <span className="text-xs text-muted-foreground">{task.assignee}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full", priorityColors[task.priority])}>
                      {task.priority}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{task.dueDate}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
