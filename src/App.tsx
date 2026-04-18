import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import { Auth } from "./pages/Auth";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { RoomSetup } from "./pages/RoomSetup";
import { RoomSettings } from "./pages/RoomSettings";
import { Expenses } from "./pages/Expenses";
import RecurringBills from "./pages/RecurringBills";
import { Tasks } from "./pages/Tasks";
import { Storage } from "./pages/Storage";
import { Chat } from "./pages/Chat";
import Alarms from "./pages/Alarms";
import Reminders from "./pages/Reminders";
import MusicSync from "./pages/MusicSync";
import Games from "./pages/Games";
import Notifications from "./pages/Notifications";
import NotificationSettings from "./pages/NotificationSettings";
import AdminPanel from "./pages/AdminPanel";
import NotFound from "./pages/NotFound";
import Install from "./pages/Install";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import DeleteAccount from "./pages/DeleteAccount";
import { GlobalAlarmLayer } from "@/components/alarms/GlobalAlarmLayer";
import { useNativeAlarm } from "@/hooks/useNativeAlarm";
import { useEffect } from "react";

const queryClient = new QueryClient();

/** Initialize native alarm permissions + battery optimization check on startup */
function NativeAlarmInit() {
  const { isNative, checkBatteryOptimization, requestDisableBatteryOptimization, requestExactAlarmPermission } = useNativeAlarm();
  useEffect(() => {
    if (isNative) {
      requestExactAlarmPermission();
      checkBatteryOptimization().then(isOptimized => {
        if (isOptimized) requestDisableBatteryOptimization();
      });
    }
  }, [isNative, checkBatteryOptimization, requestDisableBatteryOptimization, requestExactAlarmPermission]);
  return null;
}

const AuthRedirect = () => {
  const { user, currentRoom, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }
  
  if (user && currentRoom) {
    return <Navigate to="/" replace />;
  }
  
  if (user && !currentRoom) {
    return <Navigate to="/setup" replace />;
  }
  
  return <Auth />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <GlobalAlarmLayer />
          <NativeAlarmInit />
          <Routes>
            <Route path="/auth" element={<AuthRedirect />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/setup"
              element={
                <ProtectedRoute requireRoom={false}>
                  <RoomSetup />
                </ProtectedRoute>
              }
            />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses"
              element={
                <ProtectedRoute>
                  <Expenses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/recurring-bills"
              element={
                <ProtectedRoute>
                  <RecurringBills />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tasks"
              element={
                <ProtectedRoute>
                  <Tasks />
                </ProtectedRoute>
              }
            />
            <Route
              path="/storage"
              element={
                <ProtectedRoute>
                  <Storage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <Chat />
                </ProtectedRoute>
              }
            />
            <Route
              path="/alarms"
              element={
                <ProtectedRoute>
                  <Alarms />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reminders"
              element={
                <ProtectedRoute>
                  <Reminders />
                </ProtectedRoute>
              }
            />
            <Route
              path="/music"
              element={
                <ProtectedRoute>
                  <MusicSync />
                </ProtectedRoute>
              }
            />
            <Route
              path="/games"
              element={
                <ProtectedRoute>
                  <Games />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notification-settings"
              element={
                <ProtectedRoute>
                  <NotificationSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/room-settings"
              element={
                <ProtectedRoute>
                  <RoomSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminPanel />
                </ProtectedRoute>
              }
            />
            <Route path="/install" element={<Install />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route
              path="/delete-account"
              element={
                <ProtectedRoute requireRoom={false}>
                  <DeleteAccount />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
