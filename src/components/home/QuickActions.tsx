import { useNavigate } from "react-router-dom";
import { Music, Gamepad2, Clock, Receipt, Cloud, Users, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface QuickAction {
  icon: React.ElementType;
  label: string;
  gradient: string;
  delay: number;
  route?: string;
  soloHidden?: boolean;
  soloOnly?: boolean;
}

interface QuickActionsProps {
  pendingExpenseCount?: number;
}

const actions: QuickAction[] = [
  { icon: Music, label: "Music Sync", gradient: "gradient-ocean", delay: 0, route: "/music", soloHidden: true },
  { icon: Gamepad2, label: "Games", gradient: "gradient-lavender", delay: 50, route: "/games", soloHidden: true },
  { icon: ListTodo, label: "Task Manager", gradient: "gradient-lavender", delay: 50, route: "/tasks", soloOnly: true },
  { icon: Clock, label: "Alarms", gradient: "gradient-mint", delay: 100, route: "/alarms", soloHidden: true },
  { icon: Receipt, label: "Expenses", gradient: "gradient-coral", delay: 150, route: "/expenses" },
  { icon: Cloud, label: "Storage", gradient: "gradient-primary", delay: 200, route: "/storage" },
  { icon: Users, label: "Roommates", gradient: "gradient-sunset", delay: 250, route: "/room-settings", soloHidden: true },
];

export const QuickActions = ({ pendingExpenseCount = 0 }: QuickActionsProps) => {
  const navigate = useNavigate();
  const { isSoloMode } = useAuth();

  const handleClick = (action: QuickAction) => {
    if (action.route) {
      navigate(action.route);
    }
  };

  const visibleActions = actions.filter(action => {
    if (isSoloMode && action.soloHidden) return false;
    if (!isSoloMode && action.soloOnly) return false;
    return true;
  });

  return (
    <section className="px-4">
      <h2 className="font-display text-lg font-semibold text-foreground mb-4">
        Quick Actions
      </h2>
      <div className="grid grid-cols-3 gap-3">
        {visibleActions.map((action, index) => (
          <button
            key={action.label}
            onClick={() => handleClick(action)}
            className={cn(
              "relative flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-300",
              "hover:scale-105 active:scale-95 shadow-card animate-slide-up",
              action.gradient
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {action.route === "/expenses" && pendingExpenseCount > 0 && (
              <span className="absolute right-3 top-3 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/70" />
                <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-primary-foreground bg-destructive" />
              </span>
            )}
            <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 backdrop-blur-sm flex items-center justify-center">
              <action.icon className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xs font-semibold text-primary-foreground">
              {action.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};
