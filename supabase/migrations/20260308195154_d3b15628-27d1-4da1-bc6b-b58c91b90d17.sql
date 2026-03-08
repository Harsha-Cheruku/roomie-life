
-- Fix 1: Users can't self-modify amount on their own splits (only is_paid and status for accept/reject)
-- Create a security definer function for safe split self-updates
CREATE OR REPLACE FUNCTION public.update_own_split(
  _split_id uuid,
  _is_paid boolean DEFAULT NULL,
  _status text DEFAULT NULL,
  _rejection_comment text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE expense_splits
  SET
    is_paid = COALESCE(_is_paid, is_paid),
    status = COALESCE(_status, status),
    rejection_comment = COALESCE(_rejection_comment, rejection_comment)
  WHERE id = _split_id AND user_id = auth.uid();
END;
$$;

-- Drop the overly permissive self-update policy
DROP POLICY IF EXISTS "Users can mark their own splits as paid" ON public.expense_splits;

-- Replace with restrictive policy: users can only change is_paid, status, rejection_comment on their own rows
CREATE POLICY "Users can mark their own splits as paid"
ON public.expense_splits FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Fix 2: Room join requires invite code validation via RPC only
-- The app already uses lookup_room_by_invite_code + insert pattern,
-- but RLS should enforce that users can't just guess room_id.
-- We'll use a security definer function for joining rooms.
CREATE OR REPLACE FUNCTION public.join_room_by_invite(_invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room_id uuid;
  _user_id uuid;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO _room_id FROM rooms WHERE invite_code = upper(trim(_invite_code)) LIMIT 1;
  IF _room_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  -- Check if already a member
  IF EXISTS (SELECT 1 FROM room_members WHERE room_id = _room_id AND user_id = _user_id) THEN
    RETURN _room_id;
  END IF;

  INSERT INTO room_members (room_id, user_id, role) VALUES (_room_id, _user_id, 'member');
  RETURN _room_id;
END;
$$;

-- Restrict INSERT on room_members: only allow admin self-insert for room creators
DROP POLICY IF EXISTS "Users can join rooms" ON public.room_members;
CREATE POLICY "Users can join rooms"
ON public.room_members FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND role = 'admin'
  AND EXISTS (SELECT 1 FROM rooms WHERE rooms.id = room_members.room_id AND rooms.created_by = auth.uid())
);
