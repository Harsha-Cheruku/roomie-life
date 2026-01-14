import { useState, useEffect, useCallback } from "react";
import { Bell, Check, Trash2, DollarSign, ListTodo, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/empty-states/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { useNavigation } from "@/hooks/useNavigation";

type NotificationType = 'expense' | 'task' | 'reminder' | 'alarm' | 'general';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  created_at: string;
}

const typeIcons: Record<NotificationType, React.ElementType> = {
  expense: DollarSign,
  task: ListTodo,
  reminder: Clock,
  alarm: Bell,
  general: Bell,
};

const typeColors: Record<NotificationType, string> = {
  expense: "bg-mint/20 text-mint",
  task: "bg-primary/20 text-primary",
  reminder: "bg-accent/20 text-accent",
  alarm: "bg-coral/20 text-coral",
  general: "bg-muted text-muted-foreground",
};

export const Notifications = () => {
  const { user, currentRoom } = useAuth();
  const navigate = useNavigate();
  const { navigateToTab } = useNavigation();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user || !currentRoom) return;

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('room_id', currentRoom.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Cast the type to match our interface
      const typedData = (data || []).map(n => ({
        ...n,
        type: n.type as NotificationType
      }));
      setNotifications(typedData);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, currentRoom]);

  useEffect(() => {
    fetchNotifications();

    // Subscribe to realtime updates
    if (currentRoom && user) {
      const channel = supabase
        .channel('notifications-changes')
        .on(
          'postgres_changes',
          { 
            event: '*', 
            schema: 'public', 
            table: 'notifications', 
            filter: `user_id=eq.${user.id}` 
          },
          () => fetchNotifications()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [fetchNotifications, currentRoom, user]);

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.is_read) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notification.id);
    }

    // Navigate to relevant screen based on type
    switch (notification.type) {
      case 'expense':
        navigate('/expenses');
        break;
      case 'task':
        navigate('/tasks');
        break;
      case 'reminder':
        navigate('/reminders');
        break;
      case 'alarm':
        navigate('/alarms');
        break;
      default:
        break;
    }
  };

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user?.id)
        .eq('room_id', currentRoom?.id);

      if (error) throw error;

      toast({ title: 'All notifications marked as read' });
      fetchNotifications();
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      toast({ title: 'Failed to update', variant: 'destructive' });
    }
  };

  const clearAllNotifications = async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user?.id)
        .eq('room_id', currentRoom?.id);

      if (error) throw error;

      toast({ title: 'All notifications cleared' });
      setNotifications([]);
    } catch (error) {
      console.error('Error clearing notifications:', error);
      toast({ title: 'Failed to clear', variant: 'destructive' });
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="min-h-screen bg-background pb-32">
      <TopBar 
        title="Notifications" 
        showBack={true}
        rightContent={
          notifications.length > 0 && (
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <Button 
                  variant="glass" 
                  size="sm" 
                  className="press-effect gap-1.5"
                  onClick={markAllAsRead}
                >
                  <Check className="w-4 h-4" />
                  <span className="text-xs">Read all</span>
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="iconSm" 
                className="press-effect text-muted-foreground"
                onClick={clearAllNotifications}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )
        }
      />

      <div className="px-4">
        {/* Unread Count Badge */}
        {unreadCount > 0 && (
          <div className="mb-4 flex items-center gap-2 bg-primary/10 rounded-xl px-4 py-2">
            <Bell className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description="You'll see alerts for expenses, tasks, reminders and more here"
            actionLabel="Go Home"
            onAction={() => navigate('/')}
          />
        ) : (
          <div className="space-y-3">
            {notifications.map((notification, index) => {
              const Icon = typeIcons[notification.type] || Bell;
              return (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-2xl cursor-pointer transition-all animate-slide-up",
                    notification.is_read 
                      ? "bg-muted/30 hover:bg-muted/50" 
                      : "bg-card shadow-card hover:shadow-lg border-l-4 border-primary"
                  )}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    typeColors[notification.type]
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        "font-medium text-sm",
                        notification.is_read ? "text-muted-foreground" : "text-foreground"
                      )}>
                        {notification.title}
                      </p>
                      {!notification.is_read && (
                        <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                      )}
                    </div>
                    {notification.body && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notification.body}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {formatTime(notification.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
