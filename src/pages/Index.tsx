import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { BottomNav } from "@/components/layout/BottomNav";
import { Home } from "./Home";
import { useNavigation } from "@/hooks/useNavigation";
import { useReminderNotifications } from "@/hooks/useReminderNotifications";
import { useRealtimePushNotifications } from "@/hooks/useRealtimePushNotifications";
import { PushNotificationPrompt } from "@/components/notifications/PushNotificationPrompt";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNativeFcm } from "@/hooks/useNativeFcm";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";

const Index = () => {
  const { activeTab, navigateToTab } = useNavigation();
  const { isSupported, isEnabled, permission } = usePushNotifications();
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const { isAdmin, loading: adminLoading } = useSuperAdmin();
  

  // Initialize reminder notifications
  useReminderNotifications();
  
  // Initialize realtime push notifications listener
  useRealtimePushNotifications();

  // Native Android/iOS FCM token registration (no-op on web)
  useNativeFcm();

  useEffect(() => {
    if (isSupported && !isEnabled && permission === 'default') {
      const timer = setTimeout(() => {
        setShowPushPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isSupported, isEnabled, permission]);

  // Admin accounts are dashboard-only — always redirect to the admin console.
  if (adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
      </div>
    );
  }
  if (isAdmin) {
    return <Navigate to="/super-admin" replace />;
  }

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
