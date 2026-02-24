
-- Partial unique index: only one 'ringing' trigger per alarm at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_alarm_triggers_one_ringing_per_alarm
  ON public.alarm_triggers (alarm_id)
  WHERE status = 'ringing';

-- Index for fast due-time alarm queries
CREATE INDEX IF NOT EXISTS idx_alarms_active_time
  ON public.alarms (alarm_time, is_active)
  WHERE is_active = true;

-- Index for fast active-trigger lookup by room (via alarm join)
CREATE INDEX IF NOT EXISTS idx_alarm_triggers_status
  ON public.alarm_triggers (status)
  WHERE status = 'ringing';

-- Allow update on push_subscriptions (for upsert)
CREATE POLICY "Users can update their own subscriptions"
  ON public.push_subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Add unique constraint for push subscription deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_user_endpoint
  ON public.push_subscriptions (user_id, endpoint);
