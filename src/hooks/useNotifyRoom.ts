import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePushNotifications } from './usePushNotifications';

/**
 * Hook to send notifications to all room members (or specific users) with sound and push support
 */
export const useNotifyRoom = () => {
  const { user, currentRoom, profile } = useAuth();
  const { showNotification, isEnabled: pushEnabled } = usePushNotifications();

  /**
   * Notify specific users or all room members
   */
  const notifyUsers = async ({
    userIds,
    type,
    title,
    body,
    referenceType,
    referenceId,
    excludeSelf = true,
  }: {
    userIds?: string[];
    type: string;
    title: string;
    body?: string;
    referenceType?: string;
    referenceId?: string;
    excludeSelf?: boolean;
  }) => {
    if (!currentRoom || !user) return;

    try {
      // If no userIds provided, get all room members
      let targetUserIds = userIds;
      
      if (!targetUserIds) {
        const { data: members } = await supabase
          .from('room_members')
          .select('user_id')
          .eq('room_id', currentRoom.id);
        
        targetUserIds = members?.map(m => m.user_id) || [];
      }

      // Optionally exclude self
      if (excludeSelf) {
        targetUserIds = targetUserIds.filter(id => id !== user.id);
      }

      if (targetUserIds.length === 0) return;

      // Create notification records for each user
      const notifications = targetUserIds.map(userId => ({
        user_id: userId,
        room_id: currentRoom.id,
        type,
        title,
        body,
        reference_type: referenceType,
        reference_id: referenceId,
        is_read: false,
      }));

      const { error } = await supabase
        .from('notifications')
        .insert(notifications);

      if (error) {
        console.error('Error creating room notifications:', error);
      }
    } catch (error) {
      console.error('Error notifying room:', error);
    }
  };

  /**
   * Get admin user IDs for the current room
   */
  const getAdminIds = async (): Promise<string[]> => {
    if (!currentRoom) return [];

    const { data } = await supabase
      .from('room_members')
      .select('user_id')
      .eq('room_id', currentRoom.id)
      .eq('role', 'admin');

    return data?.map(m => m.user_id) || [];
  };

  /**
   * Notify admins about an event
   */
  const notifyAdmins = async ({
    type,
    title,
    body,
    referenceType,
    referenceId,
  }: {
    type: string;
    title: string;
    body?: string;
    referenceType?: string;
    referenceId?: string;
  }) => {
    const adminIds = await getAdminIds();
    await notifyUsers({
      userIds: adminIds,
      type,
      title,
      body,
      referenceType,
      referenceId,
      excludeSelf: true,
    });
  };

  return {
    notifyUsers,
    notifyAdmins,
    getAdminIds,
  };
};
