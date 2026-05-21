
-- Support tickets
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('technical','account','report','bug','general')),
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tickets" ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin_user(auth.uid()));

CREATE POLICY "Users create own tickets" ON public.support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner or admin update tickets" ON public.support_tickets
  FOR UPDATE USING (auth.uid() = user_id OR public.is_admin_user(auth.uid()));

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Messages
CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_messages_ticket ON public.support_ticket_messages(ticket_id, created_at);

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View messages of accessible tickets" ON public.support_ticket_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (t.user_id = auth.uid() OR public.is_admin_user(auth.uid()))
    )
  );

CREATE POLICY "Send message on accessible ticket" ON public.support_ticket_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (t.user_id = auth.uid() OR public.is_admin_user(auth.uid()))
    )
    AND (is_admin = false OR public.is_admin_user(auth.uid()))
  );

-- Bump ticket on new message
CREATE OR REPLACE FUNCTION public.bump_support_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.support_tickets
  SET last_message_at = now(),
      updated_at = now(),
      status = CASE
        WHEN NEW.is_admin THEN 'pending'
        ELSE 'open'
      END
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bump_support_ticket_on_message
  AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_support_ticket();

-- Admin stats: ticket count
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _total_users int; _active_users int; _total_rooms int; _total_messages int;
  _open_tickets int; _total_tickets int;
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
  RETURN jsonb_build_object(
    'total_users', _total_users,
    'active_users', _active_users,
    'total_rooms', _total_rooms,
    'total_messages', _total_messages,
    'open_tickets', _open_tickets,
    'total_tickets', _total_tickets
  );
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
