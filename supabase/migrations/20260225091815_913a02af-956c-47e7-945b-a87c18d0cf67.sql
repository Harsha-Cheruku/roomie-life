-- Add timezone_offset to alarms (stores JS getTimezoneOffset() value in minutes)
ALTER TABLE public.alarms ADD COLUMN IF NOT EXISTS timezone_offset integer NOT NULL DEFAULT 0;

-- Clean up ALL stale ringing triggers (orphaned or stuck)
UPDATE public.alarm_triggers 
SET status = 'dismissed', dismissed_at = now() 
WHERE status = 'ringing';

-- Backfill existing alarms with IST offset (-330) since all users appear to be IST
UPDATE public.alarms SET timezone_offset = -330 WHERE timezone_offset = 0;