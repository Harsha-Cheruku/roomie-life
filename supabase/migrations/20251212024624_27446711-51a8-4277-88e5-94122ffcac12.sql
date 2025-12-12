-- Create a security definer function to check room membership without triggering RLS
CREATE OR REPLACE FUNCTION public.is_room_member(_user_id uuid, _room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_members
    WHERE user_id = _user_id
      AND room_id = _room_id
  )
$$;

-- Create a function to get user's room IDs
CREATE OR REPLACE FUNCTION public.get_user_room_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT room_id
  FROM public.room_members
  WHERE user_id = _user_id
$$;

-- Drop all existing problematic policies
DROP POLICY IF EXISTS "Users can view members of their rooms" ON public.room_members;
DROP POLICY IF EXISTS "Users can view profiles of roommates" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view alarms in their rooms" ON public.alarms;
DROP POLICY IF EXISTS "Users can create alarms in their rooms" ON public.alarms;
DROP POLICY IF EXISTS "Users can view triggers in their rooms" ON public.alarm_triggers;
DROP POLICY IF EXISTS "Users can create triggers for room alarms" ON public.alarm_triggers;
DROP POLICY IF EXISTS "Users can update triggers in their rooms" ON public.alarm_triggers;
DROP POLICY IF EXISTS "Users can view acknowledgments in their rooms" ON public.alarm_acknowledgments;

-- Recreate room_members policies using security definer function
CREATE POLICY "Users can view members of their rooms" 
ON public.room_members 
FOR SELECT 
USING (room_id IN (SELECT public.get_user_room_ids(auth.uid())));

-- Recreate profiles policies
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can view profiles of roommates" 
ON public.profiles 
FOR SELECT 
USING (
  user_id IN (
    SELECT rm.user_id 
    FROM public.room_members rm 
    WHERE rm.room_id IN (SELECT public.get_user_room_ids(auth.uid()))
  )
);

-- Recreate alarms policies
CREATE POLICY "Users can view alarms in their rooms" 
ON public.alarms 
FOR SELECT 
USING (room_id IN (SELECT public.get_user_room_ids(auth.uid())));

CREATE POLICY "Users can create alarms in their rooms" 
ON public.alarms 
FOR INSERT 
WITH CHECK (room_id IN (SELECT public.get_user_room_ids(auth.uid())));

-- Recreate alarm_triggers policies
CREATE POLICY "Users can view triggers in their rooms" 
ON public.alarm_triggers 
FOR SELECT 
USING (
  alarm_id IN (
    SELECT id FROM public.alarms 
    WHERE room_id IN (SELECT public.get_user_room_ids(auth.uid()))
  )
);

CREATE POLICY "Users can create triggers for room alarms" 
ON public.alarm_triggers 
FOR INSERT 
WITH CHECK (
  alarm_id IN (
    SELECT id FROM public.alarms 
    WHERE room_id IN (SELECT public.get_user_room_ids(auth.uid()))
  )
);

CREATE POLICY "Users can update triggers in their rooms" 
ON public.alarm_triggers 
FOR UPDATE 
USING (
  alarm_id IN (
    SELECT id FROM public.alarms 
    WHERE room_id IN (SELECT public.get_user_room_ids(auth.uid()))
  )
);

-- Recreate alarm_acknowledgments policy
CREATE POLICY "Users can view acknowledgments in their rooms" 
ON public.alarm_acknowledgments 
FOR SELECT 
USING (
  trigger_id IN (
    SELECT at.id FROM public.alarm_triggers at
    JOIN public.alarms a ON a.id = at.alarm_id
    WHERE a.room_id IN (SELECT public.get_user_room_ids(auth.uid()))
  )
);