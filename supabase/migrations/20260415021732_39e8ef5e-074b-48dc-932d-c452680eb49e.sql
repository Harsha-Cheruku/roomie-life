-- Alarm audit log table for tracking who interacts with alarms
CREATE TABLE public.alarm_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alarm_id uuid REFERENCES public.alarms(id) ON DELETE CASCADE NOT NULL,
  trigger_id uuid REFERENCES public.alarm_triggers(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.alarm_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Room members can view alarm audit logs"
  ON public.alarm_audit_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alarms a
      JOIN public.room_members rm ON rm.room_id = a.room_id
      WHERE a.id = alarm_audit_logs.alarm_id AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "Room members can insert alarm audit logs"
  ON public.alarm_audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.alarms a
      JOIN public.room_members rm ON rm.room_id = a.room_id
      WHERE a.id = alarm_audit_logs.alarm_id AND rm.user_id = auth.uid()
    )
  );

CREATE INDEX idx_alarm_audit_logs_alarm_id ON public.alarm_audit_logs(alarm_id);
CREATE INDEX idx_alarm_audit_logs_created_at ON public.alarm_audit_logs(created_at DESC);