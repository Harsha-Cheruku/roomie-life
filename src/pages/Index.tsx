import { BottomNav } from "@/components/layout/BottomNav";
import { Home } from "./Home";
import { useNavigation } from "@/hooks/useNavigation";
import { useReminderNotifications } from "@/hooks/useReminderNotifications";

const Index = () => {
  const { activeTab, navigateToTab } = useNavigation();
  
  // Initialize reminder notifications - checks for due reminders
  useReminderNotifications();

  return (
    <div className="min-h-screen bg-background">
      <Home />
      <BottomNav activeTab={activeTab} onTabChange={navigateToTab} />
    </div>
  );
};

export default Index;
