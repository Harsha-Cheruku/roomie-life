
-- Add columns to reminders table for typed reminders (expense/task)
ALTER TABLE public.reminders 
  ADD COLUMN IF NOT EXISTS reminder_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS related_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notified boolean DEFAULT false;

-- Create index for the process-reminders edge function query
CREATE INDEX IF NOT EXISTS idx_reminders_due_unnotified 
  ON public.reminders (remind_at, notified) 
  WHERE notified = false AND status = 'scheduled';

-- Deduplicate push_subscriptions: add unique constraint on (user_id, endpoint)
-- First remove duplicates keeping the newest
DELETE FROM public.push_subscriptions a
  USING public.push_subscriptions b
  WHERE a.id < b.id 
    AND a.user_id = b.user_id 
    AND a.endpoint = b.endpoint;

ALTER TABLE public.push_subscriptions 
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_endpoint_unique;
ALTER TABLE public.push_subscriptions 
  ADD CONSTRAINT push_subscriptions_user_endpoint_unique UNIQUE (user_id, endpoint);
