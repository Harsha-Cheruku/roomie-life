import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook to send notifications to room admins
 */
export const useAdminNotifications = () => {
  const { currentRoom, user, profile } = useAuth();

  const getAdminUserIds = useCallback(async (): Promise<string[]> => {
    if (!currentRoom) return [];

    const { data, error } = await supabase
      .from('room_members')
      .select('user_id')
      .eq('room_id', currentRoom.id)
      .eq('role', 'admin');

    if (error) {
      console.error('Error fetching admins:', error);
      return [];
    }

    return data?.map(m => m.user_id) || [];
  }, [currentRoom]);

  const notifyAdmins = useCallback(async (
    type: 'expense' | 'task' | 'alarm' | 'system',
    title: string,
    body: string,
    referenceType?: string,
    referenceId?: string
  ) => {
    if (!currentRoom || !user) return;

    const adminIds = await getAdminUserIds();
    
    // Filter out current user
    const notifyIds = adminIds.filter(id => id !== user.id);

    for (const adminId of notifyIds) {
      await supabase.from('notifications').insert({
        user_id: adminId,
        room_id: currentRoom.id,
        type,
        title,
        body,
        reference_type: referenceType,
        reference_id: referenceId,
        is_read: false,
      });
    }
  }, [currentRoom, user, getAdminUserIds]);

  const notifyPaymentComplete = useCallback(async (
    expense: { id: string; title: string; paid_by: string; created_by: string },
    payerName: string,
    amount: number
  ) => {
    if (!currentRoom || !user) return;

    const adminIds = await getAdminUserIds();
    const usersToNotify = new Set([expense.paid_by, expense.created_by, ...adminIds]);
    usersToNotify.delete(user.id); // Don't notify self

    const body = `${payerName} paid ₹${amount.toFixed(0)} for "${expense.title}" in ${currentRoom.name}`;

    for (const userId of usersToNotify) {
      await supabase.from('notifications').insert({
        user_id: userId,
        room_id: currentRoom.id,
        type: 'expense',
        title: '💸 Payment Complete',
        body,
        reference_type: 'expense',
        reference_id: expense.id,
        is_read: false,
      });
    }
  }, [currentRoom, user, getAdminUserIds]);

  const notifyTaskComplete = useCallback(async (
    task: { id: string; title: string; created_by: string; assigned_to: string },
    completerName: string
  ) => {
    if (!currentRoom || !user) return;

    const adminIds = await getAdminUserIds();
    const usersToNotify = new Set([task.created_by, ...adminIds]);
    usersToNotify.delete(user.id); // Don't notify self
    usersToNotify.delete(task.assigned_to); // Don't notify person who completed

    const body = `${completerName} completed "${task.title}" in ${currentRoom.name}`;

    for (const userId of usersToNotify) {
      await supabase.from('notifications').insert({
        user_id: userId,
        room_id: currentRoom.id,
        type: 'task',
        title: '✅ Task Completed',
        body,
        reference_type: 'task',
        reference_id: task.id,
        is_read: false,
      });
    }
  }, [currentRoom, user, getAdminUserIds]);

  return {
    getAdminUserIds,
    notifyAdmins,
    notifyPaymentComplete,
    notifyTaskComplete,
  };
};
