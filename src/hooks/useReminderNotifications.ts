/**
 * Disabled: realtime listener removed to free a socket per active user and
 * reduce DB CPU. Reminder delivery is unaffected — the server-side
 * `process-reminders` edge function inserts into `notifications`, which the
 * notification bell polls and Web Push delivers as a system toast.
 */
export const useReminderNotifications = () => {
  // no-op
};
