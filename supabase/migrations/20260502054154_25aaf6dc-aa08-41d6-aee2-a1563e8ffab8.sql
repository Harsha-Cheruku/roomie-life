-- Ensure realtime delivers full row payloads for chat tables and includes
-- message_views / message_reactions in the realtime publication so that
-- read receipts and reactions sync live.
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.message_views REPLICA IDENTITY FULL;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_views'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.message_views';
  END IF;
END $$;