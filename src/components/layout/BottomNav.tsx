import { Home, ListTodo, Receipt, Cloud, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  icon: React.ElementType;
  label: string;
  id: string;
  color: string;
}

const navItems: NavItem[] = [
  { icon: Home, label: "Home", id: "home", color: "text-primary" },
  { icon: ListTodo, label: "Tasks", id: "tasks", color: "text-mint" },
  { icon: Receipt, label: "Expenses", id: "expenses", color: "text-coral" },
  { icon: Cloud, label: "Storage", id: "storage", color: "text-lavender" },
  { icon: MessageCircle, label: "Chat", id: "chat", color: "text-accent" },
];

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border/50 px-2 pb-safe">
      <div className="max-w-lg mx-auto flex items-center justify-around py-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all duration-300",
                isActive
                  ? "bg-primary/10 scale-105"
                  : "hover:bg-muted/50 active:scale-95"
              )}
            >
              <item.icon
                className={cn(
                  "w-6 h-6 transition-all duration-300",
                  isActive ? item.color : "text-muted-foreground"
                )}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span
                className={cn(
                  "text-xs font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
              {isActive && (
                <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-primary animate-scale-in" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
