import { useState, useEffect } from "react";
import { BottomNav } from "@/components/layout/BottomNav";
import { Home } from "./Home";
import { useNavigation } from "@/hooks/useNavigation";
import { useReminderNotifications } from "@/hooks/useReminderNotifications";
import { useRealtimePushNotifications } from "@/hooks/useRealtimePushNotifications";
import { PushNotificationPrompt } from "@/components/notifications/PushNotificationPrompt";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const Index = () => {
  const { activeTab, navigateToTab } = useNavigation();
  const { isSupported, isEnabled, permission } = usePushNotifications();
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  
  // Initialize reminder notifications - checks for due reminders
  useReminderNotifications();
  
  // Initialize realtime push notifications listener
  useRealtimePushNotifications();

  // Show push notification prompt after a delay if not already enabled
  useEffect(() => {
    if (isSupported && !isEnabled && permission === 'default') {
      const timer = setTimeout(() => {
        setShowPushPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isSupported, isEnabled, permission]);

  return (
    <div className="min-h-screen bg-background">
      {showPushPrompt && (
        <PushNotificationPrompt 
          variant="banner" 
          onDismiss={() => setShowPushPrompt(false)} 
        />
      )}
      <Home />
      <BottomNav activeTab={activeTab} onTabChange={navigateToTab} />
    </div>
  );
};

export default Index;
