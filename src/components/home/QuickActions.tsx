import { useNavigate } from "react-router-dom";
import { Music, Gamepad2, Clock, Receipt, Cloud, Users, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface QuickAction {
  icon: React.ElementType;
  label: string;
  gradient: string;
  delay: number;
  route?: string;
  soloHidden?: boolean;
}

const actions: QuickAction[] = [
  { icon: Music, label: "Music Sync", gradient: "gradient-ocean", delay: 0, route: "/music" },
  { icon: Gamepad2, label: "Games", gradient: "gradient-lavender", delay: 50, route: "/games" },
  { icon: Clock, label: "Alarms", gradient: "gradient-mint", delay: 100, route: "/alarms", soloHidden: true },
  { icon: Bell, label: "Reminders", gradient: "gradient-sunset", delay: 150, route: "/reminders" },
  { icon: Receipt, label: "Expenses", gradient: "gradient-coral", delay: 200, route: "/expenses" },
  { icon: Cloud, label: "Storage", gradient: "gradient-primary", delay: 250, route: "/storage" },
  { icon: Users, label: "Roommates", gradient: "gradient-sunset", delay: 300, route: "/room-settings", soloHidden: true },
];

export const QuickActions = () => {
  const navigate = useNavigate();
  const { isSoloMode } = useAuth();

  const handleClick = (action: QuickAction) => {
    if (action.route) {
      navigate(action.route);
    }
  };

  // Filter actions based on solo mode and admin status
  const visibleActions = actions.filter(action => {
    if (isSoloMode && action.soloHidden) return false;
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
              "flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-300",
              "hover:scale-105 active:scale-95 shadow-card animate-slide-up",
              action.gradient
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
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
