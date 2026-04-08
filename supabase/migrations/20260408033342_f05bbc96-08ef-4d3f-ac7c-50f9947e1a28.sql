ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS public.message_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT message_views_message_id_user_id_key UNIQUE (message_id, user_id)
);

ALTER TABLE public.message_views ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_message_views_user_id_seen_at
ON public.message_views(user_id, seen_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'Users can update their own messages'
  ) THEN
    CREATE POLICY "Users can update their own messages"
    ON public.messages
    FOR UPDATE
    USING (sender_id = auth.uid())
    WITH CHECK (sender_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'message_views'
      AND policyname = 'Room members can view message views'
  ) THEN
    CREATE POLICY "Room members can view message views"
    ON public.message_views
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.messages m
        JOIN public.room_members rm ON rm.room_id = m.room_id
        WHERE m.id = message_views.message_id
          AND rm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'message_views'
      AND policyname = 'Users can create their own message views'
  ) THEN
    CREATE POLICY "Users can create their own message views"
    ON public.message_views
    FOR INSERT
    WITH CHECK (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1
        FROM public.messages m
        JOIN public.room_members rm ON rm.room_id = m.room_id
        WHERE m.id = message_views.message_id
          AND rm.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'message_views'
      AND policyname = 'Users can update their own message views'
  ) THEN
    CREATE POLICY "Users can update their own message views"
    ON public.message_views
    FOR UPDATE
    USING (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1
        FROM public.messages m
        JOIN public.room_members rm ON rm.room_id = m.room_id
        WHERE m.id = message_views.message_id
          AND rm.user_id = auth.uid()
      )
    )
    WITH CHECK (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1
        FROM public.messages m
        JOIN public.room_members rm ON rm.room_id = m.room_id
        WHERE m.id = message_views.message_id
          AND rm.user_id = auth.uid()
      )
    );
  END IF;
END $$;