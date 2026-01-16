import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const useNotificationBell = () => {
  const { user, currentRoom } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    try {
      // Fetch all unread notifications for the user (across all rooms if no currentRoom)
      let query = supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      // Only filter by room if we have one
      if (currentRoom?.id) {
        query = query.eq('room_id', currentRoom.id);
      }

      const { count, error } = await query;

      if (error) {
        console.error('Error fetching unread count:', error);
        return;
      }
      
      setUnreadCount(count || 0);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, currentRoom?.id]);

  useEffect(() => {
    fetchUnreadCount();

    if (!user) return;

    // Subscribe to realtime updates for notifications
    const channel = supabase
      .channel(`notifications-bell-${user.id}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          console.log('Notification change detected, refetching...');
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, currentRoom?.id, fetchUnreadCount]);

  return { unreadCount, isLoading, refetch: fetchUnreadCount };
};
