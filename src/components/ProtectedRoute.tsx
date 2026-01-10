import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireRoom?: boolean;
}

export const ProtectedRoute = ({ children, requireRoom = true }: ProtectedRouteProps) => {
  const { user, currentRoom, loading, userRooms } = useAuth();
  const location = useLocation();
  const [isStable, setIsStable] = useState(false);

  // Wait for auth state to stabilize before rendering
  useEffect(() => {
    if (!loading) {
      // Small delay to ensure state is fully propagated
      const timer = setTimeout(() => {
        setIsStable(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loading, user, currentRoom]);

  if (loading || !isStable) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center animate-pulse">
          <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🏠</span>
          </div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  // Only redirect to setup if user has no rooms at all
  if (requireRoom && !currentRoom && userRooms.length === 0) {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
};
