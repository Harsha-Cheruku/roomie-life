
-- pg_net is needed to call our edge function from a trigger
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Native FCM token column (used by the Android Capacitor build).
-- Nullable + indexed for the FCM-side dispatcher.
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS fcm_token text,
  ADD COLUMN IF NOT EXISTS platform text;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_fcm_idx
  ON public.push_subscriptions(user_id, fcm_token)
  WHERE fcm_token IS NOT NULL;

-- Trigger function: fire-and-forget HTTP call to send-push
CREATE OR REPLACE FUNCTION public.notify_push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url text := 'https://wwungotslsvanzyczwui.supabase.co/functions/v1/send-push';
  _anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3dW5nb3RzbHN2YW56eWN6d3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMTAzNzQsImV4cCI6MjA4MDc4NjM3NH0.NU98d341iVyJPOSB2_SCL3eoB4EP6P2C6Fcicv7ytj4';
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.body,
      'reference_type', NEW.reference_type,
      'tag', 'roomsync-' || COALESCE(NEW.type, 'general') || '-' || NEW.id::text
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the notification insert because of push delivery
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_push_on_notification_insert ON public.notifications;
CREATE TRIGGER trg_notify_push_on_notification_insert
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.notify_push_on_notification_insert();
