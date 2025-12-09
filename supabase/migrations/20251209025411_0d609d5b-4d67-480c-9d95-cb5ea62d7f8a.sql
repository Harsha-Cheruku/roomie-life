-- Create messages table for room chat
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages in their rooms
CREATE POLICY "Users can view messages in their rooms"
ON public.messages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM room_members
  WHERE room_members.room_id = messages.room_id
  AND room_members.user_id = auth.uid()
));

-- Users can send messages to their rooms
CREATE POLICY "Users can send messages to their rooms"
ON public.messages FOR INSERT
WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM room_members
    WHERE room_members.room_id = messages.room_id
    AND room_members.user_id = auth.uid()
  )
);

-- Users can delete their own messages
CREATE POLICY "Users can delete their own messages"
ON public.messages FOR DELETE
USING (sender_id = auth.uid());

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;