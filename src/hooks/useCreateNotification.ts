import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type NotificationType = 'expense' | 'task' | 'reminder' | 'alarm' | 'chat' | 'system';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  referenceType?: string;
  referenceId?: string;
}

export const useCreateNotification = () => {
  const { currentRoom } = useAuth();

  const createNotification = async ({
    userId,
    type,
    title,
    body,
    referenceType,
    referenceId,
  }: CreateNotificationParams) => {
    if (!currentRoom) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          room_id: currentRoom.id,
          type,
          title,
          body,
          reference_type: referenceType,
          reference_id: referenceId,
          is_read: false,
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  };

  const createExpenseNotification = async (
    expense: { id: string; title: string; total_amount: number; created_by: string },
    assignedUserIds: string[]
  ) => {
    if (!currentRoom) return;

    // Notify all assigned users except the creator
    const notifyUsers = assignedUserIds.filter(id => id !== expense.created_by);

    for (const userId of notifyUsers) {
      await createNotification({
        userId,
        type: 'expense',
        title: '💰 New expense assigned',
        body: `You've been added to "${expense.title}" (₹${expense.total_amount.toFixed(0)})`,
        referenceType: 'expense',
        referenceId: expense.id,
      });
    }
  };

  const createTaskNotification = async (
    task: { id: string; title: string; created_by: string; assigned_to: string }
  ) => {
    if (!currentRoom) return;

    // Only notify if assigned to someone else
    if (task.assigned_to === task.created_by) return;

    await createNotification({
      userId: task.assigned_to,
      type: 'task',
      title: '📋 New task assigned',
      body: `You've been assigned: "${task.title}"`,
      referenceType: 'task',
      referenceId: task.id,
    });
  };

  return {
    createNotification,
    createExpenseNotification,
    createTaskNotification,
  };
};
