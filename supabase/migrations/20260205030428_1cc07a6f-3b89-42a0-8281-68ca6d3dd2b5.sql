-- Add per-device ownership for alarms (so only the creator's original device rings)
ALTER TABLE public.alarms
ADD COLUMN IF NOT EXISTS owner_device_id text;

CREATE INDEX IF NOT EXISTS idx_alarms_room_id_active_time
ON public.alarms (room_id, is_active, alarm_time);

CREATE INDEX IF NOT EXISTS idx_alarms_owner_device_id
ON public.alarms (owner_device_id);
