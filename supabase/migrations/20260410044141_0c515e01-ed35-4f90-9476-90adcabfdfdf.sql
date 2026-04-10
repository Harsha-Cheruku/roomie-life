-- Fix UPDATE policy: use is_room_admin() to avoid infinite recursion
DROP POLICY IF EXISTS "Admins can update member roles" ON public.room_members;

CREATE POLICY "Admins can update member roles"
ON public.room_members
FOR UPDATE
TO authenticated
USING (public.is_room_admin(room_members.room_id, auth.uid()))
WITH CHECK (public.is_room_admin(room_members.room_id, auth.uid()));

-- Fix DELETE policy: use is_room_admin() to avoid infinite recursion
DROP POLICY IF EXISTS "Admins can remove members" ON public.room_members;

CREATE POLICY "Admins can remove members"
ON public.room_members
FOR DELETE
TO authenticated
USING (public.is_room_admin(room_members.room_id, auth.uid()) OR auth.uid() = user_id);