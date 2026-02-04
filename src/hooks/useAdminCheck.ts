import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const useAdminCheck = () => {
  const { user, currentRoom } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [roomAdminId, setRoomAdminId] = useState<string | null>(null);

  const checkAdminStatus = useCallback(async () => {
    if (!user?.id || !currentRoom?.id) {
      setIsAdmin(false);
      setIsLoading(false);
      return;
    }

    try {
      // Use the database function to check admin status (server-side check)
      const { data, error } = await supabase
        .rpc('is_room_admin', {
          _room_id: currentRoom.id,
          _user_id: user.id
        });

      if (error) throw error;
      setIsAdmin(data === true);

      // Also fetch the room admin ID for transfer purposes
      const { data: adminData } = await supabase
        .from('room_members')
        .select('user_id')
        .eq('room_id', currentRoom.id)
        .eq('role', 'admin')
        .limit(1)
        .single();

      if (adminData) {
        setRoomAdminId(adminData.user_id);
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsAdmin(false);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, currentRoom?.id]);

  useEffect(() => {
    checkAdminStatus();
  }, [checkAdminStatus]);

  return { 
    isAdmin, 
    isLoading, 
    roomAdminId,
    refetch: checkAdminStatus 
  };
};
