import { useState, useEffect } from "react";
import { BottomNav } from "@/components/layout/BottomNav";
import { Home } from "./Home";
import { useNavigation } from "@/hooks/useNavigation";
import { useReminderNotifications } from "@/hooks/useReminderNotifications";
import { useRealtimePushNotifications } from "@/hooks/useRealtimePushNotifications";
import { PushNotificationPrompt } from "@/components/notifications/PushNotificationPrompt";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useGlobalAlarm } from "@/hooks/useGlobalAlarm";
import { ActiveAlarmModal } from "@/components/alarms/ActiveAlarmModal";

const Index = () => {
  const { activeTab, navigateToTab } = useNavigation();
  const { isSupported, isEnabled, permission } = usePushNotifications();
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  
  // Global alarm — rings on any page when trigger is active
  const { activeTrigger, activeAlarm, handleDismissed } = useGlobalAlarm();

  // Initialize reminder notifications
  useReminderNotifications();
  
  // Initialize realtime push notifications listener
  useRealtimePushNotifications();

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

      {/* Global alarm modal — shows on ANY page */}
      {activeTrigger && activeAlarm && (
        <ActiveAlarmModal
          trigger={activeTrigger}
          alarm={activeAlarm}
          onDismissed={handleDismissed}
        />
      )}
    </div>
  );
};

export default Index;
