-- Create a stable helper that returns an array (not set-returning) for use in RLS
CREATE OR REPLACE FUNCTION public.user_room_ids_array(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(room_id), ARRAY[]::uuid[])
  FROM public.room_members
  WHERE user_id = _user_id
$$;

-- Fix expenses: add WITH CHECK to prevent room_id tampering
DROP POLICY IF EXISTS "Users can update expenses they created" ON expenses;

CREATE POLICY "Users can update expenses they created"
  ON expenses
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (
    created_by = auth.uid() 
    AND room_id = ANY(user_room_ids_array(auth.uid()))
  );

-- Fix tasks: add WITH CHECK to prevent room_id tampering  
DROP POLICY IF EXISTS "Assigned users and creators can update tasks" ON tasks;

CREATE POLICY "Assigned users and creators can update tasks"
  ON tasks
  FOR UPDATE
  TO authenticated
  USING ((assigned_to = auth.uid()) OR (created_by = auth.uid()))
  WITH CHECK (
    ((assigned_to = auth.uid()) OR (created_by = auth.uid()))
    AND room_id = ANY(user_room_ids_array(auth.uid()))
  );