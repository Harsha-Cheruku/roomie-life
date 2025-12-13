-- Create tasks table
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  assigned_to UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, rejected, in_progress, done
  priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high
  due_date TIMESTAMP WITH TIME ZONE,
  reminder_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies for tasks
CREATE POLICY "Users can view tasks in their rooms"
ON public.tasks FOR SELECT
USING (room_id IN (SELECT get_user_room_ids(auth.uid())));

CREATE POLICY "Users can create tasks in their rooms"
ON public.tasks FOR INSERT
WITH CHECK (room_id IN (SELECT get_user_room_ids(auth.uid())));

CREATE POLICY "Assigned users and creators can update tasks"
ON public.tasks FOR UPDATE
USING (assigned_to = auth.uid() OR created_by = auth.uid());

CREATE POLICY "Creators can delete tasks"
ON public.tasks FOR DELETE
USING (created_by = auth.uid());

-- Add status column to expense_splits for accept/reject
ALTER TABLE public.expense_splits 
ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

-- Update trigger for tasks
CREATE TRIGGER update_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for tasks
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;