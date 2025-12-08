import { CheckCircle2, Circle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  title: string;
  assignee: string;
  avatar: string;
  status: "todo" | "doing" | "done";
  priority: "low" | "medium" | "high";
  dueDate: string;
}

const mockTasks: Task[] = [
  {
    id: "1",
    title: "Buy groceries",
    assignee: "Alex",
    avatar: "🎮",
    status: "doing",
    priority: "high",
    dueDate: "Today",
  },
  {
    id: "2",
    title: "Pay electricity bill",
    assignee: "You",
    avatar: "😎",
    status: "todo",
    priority: "high",
    dueDate: "Tomorrow",
  },
  {
    id: "3",
    title: "Clean kitchen",
    assignee: "Sam",
    avatar: "🎵",
    status: "done",
    priority: "medium",
    dueDate: "Done",
  },
];

const priorityColors = {
  low: "bg-mint/20 text-mint",
  medium: "bg-accent/20 text-accent",
  high: "bg-coral/20 text-coral",
};

const statusIcons = {
  todo: Circle,
  doing: Clock,
  done: CheckCircle2,
};

export const TaskPreview = () => {
  return (
    <section className="px-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Tasks
        </h2>
        <button className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
          See Board
        </button>
      </div>

      {/* Status Pills */}
      <div className="flex gap-2 mb-4">
        {[
          { label: "To Do", count: 3, color: "bg-muted text-muted-foreground" },
          { label: "Doing", count: 2, color: "bg-accent/20 text-accent" },
          { label: "Done", count: 5, color: "bg-mint/20 text-mint" },
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
        {mockTasks.map((task, index) => {
          const StatusIcon = statusIcons[task.status];
          return (
            <div
              key={task.id}
              className="bg-card rounded-2xl p-4 shadow-card flex items-center gap-3 animate-slide-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <StatusIcon
                className={cn(
                  "w-5 h-5 flex-shrink-0",
                  task.status === "done"
                    ? "text-mint"
                    : task.status === "doing"
                    ? "text-accent"
                    : "text-muted-foreground"
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
                  <span className="text-lg">{task.avatar}</span>
                  <span className="text-xs text-muted-foreground">
                    {task.assignee}
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
              <div className="text-xs font-medium text-muted-foreground">
                {task.dueDate}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
