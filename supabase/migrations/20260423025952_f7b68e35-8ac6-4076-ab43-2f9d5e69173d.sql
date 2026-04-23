
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON public.message_reactions(message_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Room members can view reactions"
ON public.message_reactions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.messages m
  JOIN public.room_members rm ON rm.room_id = m.room_id
  WHERE m.id = message_reactions.message_id AND rm.user_id = auth.uid()
));

CREATE POLICY "Users can add their own reactions"
ON public.message_reactions FOR INSERT
WITH CHECK (auth.uid() = user_id AND EXISTS (
  SELECT 1 FROM public.messages m
  JOIN public.room_members rm ON rm.room_id = m.room_id
  WHERE m.id = message_reactions.message_id AND rm.user_id = auth.uid()
));

CREATE POLICY "Users can remove their own reactions"
ON public.message_reactions FOR DELETE
USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
