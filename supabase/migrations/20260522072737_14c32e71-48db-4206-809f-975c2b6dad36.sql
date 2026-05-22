-- Reports table
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  reported_user_id uuid,
  report_type text NOT NULL DEFAULT 'other',
  target_type text,
  target_id uuid,
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  admin_notes text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports(created_at DESC);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users create own reports"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users view own reports or admin"
  ON public.reports FOR SELECT
  USING (auth.uid() = reporter_id OR public.is_admin_user(auth.uid()));

CREATE POLICY "Admins update reports"
  ON public.reports FOR UPDATE
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

CREATE POLICY "Admins delete reports"
  ON public.reports FOR DELETE
  USING (public.is_admin_user(auth.uid()));

CREATE TRIGGER update_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
ALTER TABLE public.reports REPLICA IDENTITY FULL;

-- Update admin stats to include reports
CREATE OR REPLACE FUNCTION public.get_admin_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _total_users int; _active_users int; _total_rooms int; _total_messages int;
  _open_tickets int; _total_tickets int; _open_reports int; _total_reports int;
BEGIN
  IF _uid IS NULL OR NOT public.is_admin_user(_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT COUNT(*) INTO _total_users FROM public.profiles;
  SELECT COUNT(DISTINCT sender_id) INTO _active_users
    FROM public.messages WHERE created_at > now() - interval '7 days';
  SELECT COUNT(*) INTO _total_rooms FROM public.rooms;
  SELECT COUNT(*) INTO _total_messages FROM public.messages;
  SELECT COUNT(*) INTO _open_tickets FROM public.support_tickets WHERE status <> 'resolved';
  SELECT COUNT(*) INTO _total_tickets FROM public.support_tickets;
  SELECT COUNT(*) INTO _open_reports FROM public.reports WHERE status IN ('open','reviewing');
  SELECT COUNT(*) INTO _total_reports FROM public.reports;
  RETURN jsonb_build_object(
    'total_users', _total_users,
    'active_users', _active_users,
    'total_rooms', _total_rooms,
    'total_messages', _total_messages,
    'open_tickets', _open_tickets,
    'total_tickets', _total_tickets,
    'open_reports', _open_reports,
    'total_reports', _total_reports
  );
END;
$function$;