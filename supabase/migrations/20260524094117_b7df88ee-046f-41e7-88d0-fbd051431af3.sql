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
      'reference_id', NEW.reference_id,
      'tag', 'roomsync-' || COALESCE(NEW.type, 'general') || '-' || NEW.id::text
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- Allow the new `recurring_bill` notification type
DROP POLICY IF EXISTS "Users can create notifications for room members" ON public.notifications;
CREATE POLICY "Users can create notifications for room members"
ON public.notifications
FOR INSERT
TO public
WITH CHECK (
  auth.uid() IS NOT NULL
  AND is_room_member(auth.uid(), room_id)
  AND is_room_member(user_id, room_id)
  AND type = ANY (ARRAY['task','expense','reminder','alarm','chat','game','room','delete_request','delete_approved','recurring_bill'])
);