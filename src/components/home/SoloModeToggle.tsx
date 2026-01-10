import { User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const SoloModeToggle = () => {
  const { isSoloMode, toggleSoloMode, userRooms } = useAuth();

  const handleToggle = () => {
    toggleSoloMode();
    toast(isSoloMode ? "Room Mode activated" : "Solo Mode activated", {
      description: isSoloMode 
        ? "Showing all room expenses and tasks" 
        : "Only showing your personal items",
      duration: 2000,
    });
  };

  // Only show if user has rooms
  if (userRooms.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all",
        isSoloMode ? "bg-lavender/20" : "bg-primary/10"
      )}>
        {isSoloMode ? (
          <User className="w-3.5 h-3.5 text-lavender" />
        ) : (
          <Users className="w-3.5 h-3.5 text-primary" />
        )}
        <span className="text-xs font-medium">
          {isSoloMode ? "Solo" : "Room"}
        </span>
      </div>
      <Switch
        checked={isSoloMode}
        onCheckedChange={handleToggle}
        className="data-[state=checked]:bg-lavender"
      />
    </div>
  );
};
