import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useVisibilityPoll } from './useVisibilityPoll';

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
      // Fetch all unread notifications for the user
      let query = supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
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

  // Lazy poll (45s, visible-tab only) — replaces 3 always-on realtime listeners.
  useVisibilityPoll(fetchUnreadCount, 45_000, [user?.id, currentRoom?.id]);

  return { unreadCount, isLoading, refetch: fetchUnreadCount };
};
