import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReminderCount } from "@/hooks/useReminderCount";
import { ReminderPanel } from "./ReminderPanel";

interface ReminderBellIconProps {
  /** Filter reminders by type: 'expense' or 'task' */
  filterType: "expense" | "task";
}

export const ReminderBellIcon = ({ filterType }: ReminderBellIconProps) => {
  const { count, refetch } = useReminderCount(filterType);
  const [showPanel, setShowPanel] = useState(false);

  return (
    <>
      <Button
        variant="glass"
        size="iconSm"
        className="relative press-effect"
        onClick={() => setShowPanel(true)}
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-coral text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Button>

      <ReminderPanel
        open={showPanel}
        onOpenChange={setShowPanel}
        filterType={filterType}
        onUpdate={refetch}
      />
    </>
  );
};
