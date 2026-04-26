import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { lazy, Suspense, useEffect } from "react";

// Eager: needed on first paint for any route
import Index from "./pages/Index";
import { Auth } from "./pages/Auth";

// Lazy: heavy / non-initial routes — drastically cuts initial bundle on Android
const ForgotPassword = lazy(() => import("./pages/ForgotPassword").then(m => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import("./pages/ResetPassword").then(m => ({ default: m.ResetPassword })));
const RoomSetup = lazy(() => import("./pages/RoomSetup").then(m => ({ default: m.RoomSetup })));
const RoomSettings = lazy(() => import("./pages/RoomSettings").then(m => ({ default: m.RoomSettings })));
const Expenses = lazy(() => import("./pages/Expenses").then(m => ({ default: m.Expenses })));
const RecurringBills = lazy(() => import("./pages/RecurringBills"));
const Tasks = lazy(() => import("./pages/Tasks").then(m => ({ default: m.Tasks })));
const Storage = lazy(() => import("./pages/Storage").then(m => ({ default: m.Storage })));
const Chat = lazy(() => import("./pages/Chat").then(m => ({ default: m.Chat })));
const Alarms = lazy(() => import("./pages/Alarms"));
const Reminders = lazy(() => import("./pages/Reminders"));
const MusicSync = lazy(() => import("./pages/MusicSync"));
const Games = lazy(() => import("./pages/Games"));
const Notifications = lazy(() => import("./pages/Notifications"));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Install = lazy(() => import("./pages/Install"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const DeleteAccount = lazy(() => import("./pages/DeleteAccount"));
import { GlobalAlarmLayer } from "@/components/alarms/GlobalAlarmLayer";
import { useNativeAlarm } from "@/hooks/useNativeAlarm";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-pulse text-muted-foreground text-sm">Loading…</div>
  </div>
);

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
          <Suspense fallback={<RouteFallback />}>
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
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
