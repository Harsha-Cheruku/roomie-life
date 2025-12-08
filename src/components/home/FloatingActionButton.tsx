import { Plus, X, Receipt, ListTodo, Clock, Camera } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface FabAction {
  icon: React.ElementType;
  label: string;
  color: string;
  onClick?: () => void;
}

const actions: FabAction[] = [
  { icon: Receipt, label: "Add Expense", color: "bg-coral" },
  { icon: ListTodo, label: "New Task", color: "bg-mint" },
  { icon: Clock, label: "Set Alarm", color: "bg-lavender" },
  { icon: Camera, label: "Scan Bill", color: "bg-accent" },
];

export const FloatingActionButton = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-24 right-4 z-40">
      {/* Action buttons */}
      <div
        className={cn(
          "absolute bottom-16 right-0 flex flex-col gap-3 transition-all duration-300",
          isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        {actions.map((action, index) => (
          <div
            key={action.label}
            className="flex items-center gap-3 animate-scale-in"
            style={{ animationDelay: `${(actions.length - index) * 50}ms` }}
          >
            <span className="bg-card px-3 py-1.5 rounded-lg shadow-card text-sm font-medium text-foreground whitespace-nowrap">
              {action.label}
            </span>
            <button
              className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg",
                "transition-transform duration-200 hover:scale-110 active:scale-95",
                action.color
              )}
            >
              <action.icon className="w-5 h-5 text-primary-foreground" />
            </button>
          </div>
        ))}
      </div>

      {/* Main FAB */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-14 h-14 rounded-2xl flex items-center justify-center shadow-glow",
          "transition-all duration-300 hover:scale-105 active:scale-95",
          isOpen ? "bg-foreground rotate-45" : "gradient-primary"
        )}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-background" />
        ) : (
          <Plus className="w-6 h-6 text-primary-foreground" />
        )}
      </button>
    </div>
  );
};
