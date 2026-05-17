
-- Delete request tables
CREATE TABLE public.expense_delete_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL UNIQUE,
  room_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE public.expense_delete_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.expense_delete_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  approve boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, user_id)
);

ALTER TABLE public.expense_delete_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_delete_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Room members view delete requests"
  ON public.expense_delete_requests FOR SELECT
  USING (public.is_room_member(auth.uid(), room_id));

CREATE POLICY "Room members view delete votes"
  ON public.expense_delete_votes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.expense_delete_requests r
    WHERE r.id = request_id AND public.is_room_member(auth.uid(), r.room_id)
  ));

-- Helper: get participants of an expense (creator + all split users, distinct)
CREATE OR REPLACE FUNCTION public.get_expense_participants(_expense_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT uid FROM (
    SELECT created_by AS uid FROM public.expenses WHERE id = _expense_id
    UNION
    SELECT user_id AS uid FROM public.expense_splits WHERE expense_id = _expense_id
  ) p WHERE uid IS NOT NULL
$$;

-- Request deletion
CREATE OR REPLACE FUNCTION public.request_expense_delete(_expense_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _room_id uuid;
  _title text;
  _request_id uuid;
  _is_participant boolean;
  _other uuid;
  _requester_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT room_id, title INTO _room_id, _title FROM public.expenses WHERE id = _expense_id;
  IF _room_id IS NULL THEN RAISE EXCEPTION 'Expense not found'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.get_expense_participants(_expense_id) p WHERE p = _uid)
    INTO _is_participant;
  IF NOT _is_participant THEN RAISE EXCEPTION 'Only bill participants can request deletion'; END IF;

  INSERT INTO public.expense_delete_requests (expense_id, room_id, requested_by)
  VALUES (_expense_id, _room_id, _uid)
  ON CONFLICT (expense_id) DO UPDATE SET status = 'pending', requested_by = EXCLUDED.requested_by, created_at = now(), resolved_at = NULL
  RETURNING id INTO _request_id;

  -- Requester auto-approves
  INSERT INTO public.expense_delete_votes (request_id, user_id, approve)
  VALUES (_request_id, _uid, true)
  ON CONFLICT (request_id, user_id) DO UPDATE SET approve = true;

  SELECT display_name INTO _requester_name FROM public.profiles WHERE user_id = _uid;

  -- Notify other participants
  FOR _other IN SELECT p FROM public.get_expense_participants(_expense_id) p WHERE p <> _uid LOOP
    INSERT INTO public.notifications (user_id, room_id, type, title, body, reference_id, reference_type)
    VALUES (_other, _room_id, 'delete_request',
            'Delete bill request',
            COALESCE(_requester_name,'Someone') || ' wants to delete "' || COALESCE(_title,'a bill') || '". Tap to vote.',
            _expense_id, 'expense');
  END LOOP;

  RETURN _request_id;
END;
$$;

-- Vote on a request; auto-deletes when majority of others approve
CREATE OR REPLACE FUNCTION public.vote_expense_delete(_request_id uuid, _approve boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req record;
  _is_participant boolean;
  _total_others int;
  _approvals int;
  _title text;
  _other uuid;
  _voter_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _req FROM public.expense_delete_requests WHERE id = _request_id;
  IF _req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _req.status <> 'pending' THEN RETURN _req.status; END IF;

  SELECT EXISTS (SELECT 1 FROM public.get_expense_participants(_req.expense_id) p WHERE p = _uid)
    INTO _is_participant;
  IF NOT _is_participant THEN RAISE EXCEPTION 'Not a bill participant'; END IF;

  INSERT INTO public.expense_delete_votes (request_id, user_id, approve)
  VALUES (_request_id, _uid, _approve)
  ON CONFLICT (request_id, user_id) DO UPDATE SET approve = EXCLUDED.approve, created_at = now();

  SELECT title INTO _title FROM public.expenses WHERE id = _req.expense_id;
  SELECT display_name INTO _voter_name FROM public.profiles WHERE user_id = _uid;

  -- Count others (exclude requester) and approvals among them
  SELECT COUNT(*) INTO _total_others
    FROM public.get_expense_participants(_req.expense_id) p
    WHERE p <> _req.requested_by;

  SELECT COUNT(*) INTO _approvals
    FROM public.expense_delete_votes v
    JOIN public.get_expense_participants(_req.expense_id) p ON p = v.user_id
    WHERE v.request_id = _request_id
      AND v.approve = true
      AND v.user_id <> _req.requested_by;

  -- Majority of others approved -> delete
  IF _total_others = 0 OR _approvals * 2 > _total_others THEN
    UPDATE public.expense_delete_requests SET status='approved', resolved_at=now() WHERE id=_request_id;

    DELETE FROM public.expense_splits WHERE expense_id = _req.expense_id;
    DELETE FROM public.expense_items WHERE expense_id = _req.expense_id;
    DELETE FROM public.expenses WHERE id = _req.expense_id;

    FOR _other IN SELECT p FROM public.get_expense_participants(_req.expense_id) p LOOP
      INSERT INTO public.notifications (user_id, room_id, type, title, body, reference_id, reference_type)
      VALUES (_other, _req.room_id, 'delete_approved',
              'Bill deleted',
              'The bill "' || COALESCE(_title,'a bill') || '" was deleted after majority approval.',
              _req.expense_id, 'expense');
    END LOOP;

    RETURN 'approved';
  END IF;

  RETURN 'pending';
END;
$$;

-- Cancel a pending request (requester only)
CREATE OR REPLACE FUNCTION public.cancel_expense_delete(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.expense_delete_requests
   WHERE id = _request_id AND requested_by = _uid AND status = 'pending';
END;
$$;
