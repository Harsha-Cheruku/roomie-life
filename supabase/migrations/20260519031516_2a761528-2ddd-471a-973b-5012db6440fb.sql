CREATE OR REPLACE FUNCTION public.is_room_creator(_room_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rooms
    WHERE id = _room_id
      AND created_by = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_room_admin(_room_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_room_creator(_room_id, _user_id)
    OR EXISTS (
      SELECT 1
      FROM public.room_members
      WHERE room_id = _room_id
        AND user_id = _user_id
        AND role = 'admin'
    )
$$;

DROP POLICY IF EXISTS "Admins can update member roles" ON public.room_members;
CREATE POLICY "Admins can update member roles"
ON public.room_members
FOR UPDATE
TO authenticated
USING (
  public.is_room_admin(room_id, auth.uid())
  AND NOT public.is_room_creator(room_id, user_id)
)
WITH CHECK (
  public.is_room_admin(room_id, auth.uid())
  AND NOT public.is_room_creator(room_id, user_id)
);

DROP POLICY IF EXISTS "Admins can remove members" ON public.room_members;
CREATE POLICY "Admins can remove members"
ON public.room_members
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    public.is_room_admin(room_id, auth.uid())
    AND NOT public.is_room_creator(room_id, user_id)
  )
);

DROP POLICY IF EXISTS "Room admins can update rooms" ON public.rooms;
CREATE POLICY "Room admins can update rooms"
ON public.rooms
FOR UPDATE
TO authenticated
USING (public.is_room_admin(id, auth.uid()))
WITH CHECK (public.is_room_admin(id, auth.uid()));