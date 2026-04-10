-- Drop and recreate the admin update policy with explicit WITH CHECK
DROP POLICY IF EXISTS "Admins can update member roles" ON public.room_members;

CREATE POLICY "Admins can update member roles"
ON public.room_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.room_members admin_check
    WHERE admin_check.room_id = room_members.room_id
      AND admin_check.user_id = auth.uid()
      AND admin_check.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.room_members admin_check
    WHERE admin_check.room_id = room_members.room_id
      AND admin_check.user_id = auth.uid()
      AND admin_check.role = 'admin'
  )
);