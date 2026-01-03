import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface RoomMember {
  user_id: string;
  role: string;
  display_name: string;
  avatar: string;
}

export const useRoomMembers = () => {
  const { currentRoom, user } = useAuth();
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!currentRoom) {
      setMembers([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Fetch room members
      const { data: membersData, error: membersError } = await supabase
        .from('room_members')
        .select('user_id, role')
        .eq('room_id', currentRoom.id);

      if (membersError) throw membersError;

      const userIds = membersData?.map(m => m.user_id) || [];

      // Fetch profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      const result = membersData?.map(member => {
        const profile = profilesData?.find(p => p.user_id === member.user_id);
        return {
          user_id: member.user_id,
          role: member.role,
          display_name: profile?.display_name || 'Unknown',
          avatar: profile?.avatar || '😊',
        };
      }) || [];

      setMembers(result);
    } catch (err) {
      console.error('Error fetching room members:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch members'));
    } finally {
      setIsLoading(false);
    }
  }, [currentRoom]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const isAdmin = useCallback((userId?: string): boolean => {
    const targetId = userId || user?.id;
    if (!targetId) return false;
    const member = members.find(m => m.user_id === targetId);
    return member?.role === 'admin';
  }, [members, user?.id]);

  const getMemberById = useCallback((userId: string): RoomMember | undefined => {
    return members.find(m => m.user_id === userId);
  }, [members]);

  return {
    members,
    isLoading,
    error,
    refetch: fetchMembers,
    isAdmin,
    getMemberById,
    currentUserIsAdmin: isAdmin(user?.id),
  };
};