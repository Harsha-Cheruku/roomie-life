-- Create reminders table
CREATE TABLE public.reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'notified', 'completed')),
  condition_type TEXT CHECK (condition_type IN ('none', 'task_completed', 'expense_paid')),
  condition_ref_id UUID,
  allowed_completers UUID[] DEFAULT '{}',
  completed_by UUID,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Room members can view reminders"
ON public.reminders FOR SELECT
USING (public.is_room_member(auth.uid(), room_id));

CREATE POLICY "Room members can create reminders"
ON public.reminders FOR INSERT
WITH CHECK (public.is_room_member(auth.uid(), room_id) AND auth.uid() = created_by);

CREATE POLICY "Room members can update reminders"
ON public.reminders FOR UPDATE
USING (public.is_room_member(auth.uid(), room_id));

CREATE POLICY "Creator can delete reminders"
ON public.reminders FOR DELETE
USING (auth.uid() = created_by);

-- Trigger for updated_at
CREATE TRIGGER update_reminders_updated_at
BEFORE UPDATE ON public.reminders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.reminders;