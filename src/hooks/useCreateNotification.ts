import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePushNotifications } from './usePushNotifications';
import { isNotificationTypeEnabled } from '@/pages/NotificationSettings';

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
  const { currentRoom, user } = useAuth();
  const { showNotification, isEnabled: pushEnabled } = usePushNotifications();

  const triggerPushNotification = async (title: string, body?: string, type?: NotificationType) => {
    // Check if push is enabled and this notification type is enabled in preferences
    if (pushEnabled && (!type || isNotificationTypeEnabled(type === 'expense' ? 'expenses' : type + 's'))) {
      await showNotification(title, { body });
    }
  };

  const createNotification = async ({
    userId,
    type,
    title,
    body,
    referenceType,
    referenceId,
  }: CreateNotificationParams) => {
    if (!currentRoom) return;

    // Check if this notification type is enabled in user preferences
    const typeKey = type === 'expense' ? 'expenses' : type + 's';
    if (!isNotificationTypeEnabled(typeKey)) {
      console.log(`Notification type ${type} is disabled by user preferences`);
      return;
    }

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

      // Trigger push notification if this notification is for the current user
      if (userId === user?.id) {
        await triggerPushNotification(title, body, type);
      }
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

  const createTaskAcceptedNotification = async (
    task: { id: string; title: string; created_by: string; assigned_to: string },
    accepterName: string
  ) => {
    if (!currentRoom || !user) return;

    // Notify task creator that it was accepted
    if (task.created_by !== user.id) {
      await createNotification({
        userId: task.created_by,
        type: 'task',
        title: '✅ Task accepted',
        body: `${accepterName} accepted: "${task.title}"`,
        referenceType: 'task',
        referenceId: task.id,
      });
    }
  };

  const createTaskRejectedNotification = async (
    task: { id: string; title: string; created_by: string; assigned_to: string },
    rejecterName: string,
    reason?: string
  ) => {
    if (!currentRoom || !user) return;

    // Notify task creator that it was rejected
    if (task.created_by !== user.id) {
      await createNotification({
        userId: task.created_by,
        type: 'task',
        title: '❌ Task rejected',
        body: `${rejecterName} rejected: "${task.title}"${reason ? ` - "${reason}"` : ''}`,
        referenceType: 'task',
        referenceId: task.id,
      });
    }
  };

  const createTaskCompletedNotification = async (
    task: { id: string; title: string; created_by: string; assigned_to: string },
    completerName: string
  ) => {
    if (!currentRoom || !user) return;

    // Notify task creator that it was completed (if different from completer)
    if (task.created_by !== user.id) {
      await createNotification({
        userId: task.created_by,
        type: 'task',
        title: '🎉 Task completed',
        body: `${completerName} completed: "${task.title}"`,
        referenceType: 'task',
        referenceId: task.id,
      });
    }
  };

  const createExpenseAcceptedNotification = async (
    expense: { id: string; title: string; created_by: string },
    accepterName: string
  ) => {
    if (!currentRoom || !user) return;

    if (expense.created_by !== user.id) {
      await createNotification({
        userId: expense.created_by,
        type: 'expense',
        title: '✅ Expense accepted',
        body: `${accepterName} accepted the split for "${expense.title}"`,
        referenceType: 'expense',
        referenceId: expense.id,
      });
    }
  };

  const createExpenseRejectedNotification = async (
    expense: { id: string; title: string; created_by: string },
    rejecterName: string,
    reason?: string
  ) => {
    if (!currentRoom || !user) return;

    if (expense.created_by !== user.id) {
      await createNotification({
        userId: expense.created_by,
        type: 'expense',
        title: '❌ Expense rejected',
        body: `${rejecterName} rejected the split for "${expense.title}"${reason ? ` - "${reason}"` : ''}`,
        referenceType: 'expense',
        referenceId: expense.id,
      });
    }
  };

  const createExpensePaidNotification = async (
    expense: { id: string; title: string; paid_by: string },
    payerName: string,
    amount: number
  ) => {
    if (!currentRoom || !user) return;

    // Notify the person who originally paid
    if (expense.paid_by !== user.id) {
      await createNotification({
        userId: expense.paid_by,
        type: 'expense',
        title: '💸 Payment received',
        body: `${payerName} marked ₹${amount.toFixed(0)} as paid for "${expense.title}"`,
        referenceType: 'expense',
        referenceId: expense.id,
      });
    }
  };

  const createChatNotification = async (
    message: { content: string },
    senderName: string,
    recipientIds: string[]
  ) => {
    if (!currentRoom || !user) return;

    const preview = message.content.length > 50 
      ? message.content.slice(0, 50) + '...' 
      : message.content;

    for (const userId of recipientIds) {
      if (userId !== user.id) {
        await createNotification({
          userId,
          type: 'chat',
          title: `💬 ${senderName}`,
          body: preview,
          referenceType: 'chat',
        });
      }
    }
  };

  return {
    createNotification,
    createExpenseNotification,
    createTaskNotification,
    createTaskAcceptedNotification,
    createTaskRejectedNotification,
    createTaskCompletedNotification,
    createExpenseAcceptedNotification,
    createExpenseRejectedNotification,
    createExpensePaidNotification,
    createChatNotification,
  };
};
