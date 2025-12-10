-- Create alarms table
CREATE TABLE public.alarms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  alarm_time TIME NOT NULL,
  days_of_week INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6],
  is_active BOOLEAN NOT NULL DEFAULT true,
  condition_type TEXT NOT NULL DEFAULT 'anyone_can_dismiss',
  condition_value INTEGER DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create alarm_triggers table to track when alarms ring
CREATE TABLE public.alarm_triggers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alarm_id UUID NOT NULL REFERENCES public.alarms(id) ON DELETE CASCADE,
  triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ring_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ringing',
  dismissed_by UUID,
  dismissed_at TIMESTAMP WITH TIME ZONE
);

-- Create alarm_acknowledgments for tracking who acknowledged
CREATE TABLE public.alarm_acknowledgments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trigger_id UUID NOT NULL REFERENCES public.alarm_triggers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  acknowledged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(trigger_id, user_id)
);

-- Enable RLS
ALTER TABLE public.alarms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alarm_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alarm_acknowledgments ENABLE ROW LEVEL SECURITY;

-- Alarms policies
CREATE POLICY "Users can view alarms in their rooms" ON public.alarms
FOR SELECT USING (EXISTS (
  SELECT 1 FROM room_members WHERE room_members.room_id = alarms.room_id AND room_members.user_id = auth.uid()
));

CREATE POLICY "Users can create alarms in their rooms" ON public.alarms
FOR INSERT WITH CHECK (EXISTS (
  SELECT 1 FROM room_members WHERE room_members.room_id = alarms.room_id AND room_members.user_id = auth.uid()
));

CREATE POLICY "Users can update their own alarms" ON public.alarms
FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own alarms" ON public.alarms
FOR DELETE USING (created_by = auth.uid());

-- Alarm triggers policies
CREATE POLICY "Users can view triggers in their rooms" ON public.alarm_triggers
FOR SELECT USING (EXISTS (
  SELECT 1 FROM alarms JOIN room_members ON room_members.room_id = alarms.room_id
  WHERE alarms.id = alarm_triggers.alarm_id AND room_members.user_id = auth.uid()
));

CREATE POLICY "Users can create triggers for room alarms" ON public.alarm_triggers
FOR INSERT WITH CHECK (EXISTS (
  SELECT 1 FROM alarms JOIN room_members ON room_members.room_id = alarms.room_id
  WHERE alarms.id = alarm_triggers.alarm_id AND room_members.user_id = auth.uid()
));

CREATE POLICY "Users can update triggers in their rooms" ON public.alarm_triggers
FOR UPDATE USING (EXISTS (
  SELECT 1 FROM alarms JOIN room_members ON room_members.room_id = alarms.room_id
  WHERE alarms.id = alarm_triggers.alarm_id AND room_members.user_id = auth.uid()
));

-- Acknowledgments policies
CREATE POLICY "Users can view acknowledgments in their rooms" ON public.alarm_acknowledgments
FOR SELECT USING (EXISTS (
  SELECT 1 FROM alarm_triggers 
  JOIN alarms ON alarms.id = alarm_triggers.alarm_id
  JOIN room_members ON room_members.room_id = alarms.room_id
  WHERE alarm_triggers.id = alarm_acknowledgments.trigger_id AND room_members.user_id = auth.uid()
));

CREATE POLICY "Users can acknowledge alarms" ON public.alarm_acknowledgments
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.alarms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alarm_triggers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alarm_acknowledgments;

-- Add updated_at trigger
CREATE TRIGGER update_alarms_updated_at
BEFORE UPDATE ON public.alarms
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();