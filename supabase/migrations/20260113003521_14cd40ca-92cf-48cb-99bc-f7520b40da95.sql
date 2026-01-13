-- ====================================================
-- FIX 1: Room Creation RLS - The INSERT policy on rooms is RESTRICTIVE
-- which means auth.uid() IS NOT NULL must be true, but it's failing.
-- We need to make it PERMISSIVE.
-- ====================================================

-- Drop the existing restrictive INSERT policy on rooms
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON public.rooms;

-- Create a PERMISSIVE INSERT policy for rooms
CREATE POLICY "Authenticated users can create rooms" 
ON public.rooms 
FOR INSERT 
TO authenticated 
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND (created_by IS NULL OR created_by = auth.uid())
);

-- ====================================================
-- FIX 2: Room Members Admin Insert - Allow room creators to add themselves as admin
-- The current policy only allows role = 'member', blocking admin creation
-- ====================================================

-- Drop the existing restrictive INSERT policy on room_members
DROP POLICY IF EXISTS "Users can join rooms as member only" ON public.room_members;

-- Create a new policy that allows:
-- 1. Users to join rooms as members (for invite code joins)
-- 2. Room creators to add themselves as admin (for room creation)
CREATE POLICY "Users can join rooms" 
ON public.room_members 
FOR INSERT 
TO authenticated 
WITH CHECK (
  auth.uid() = user_id
  AND (
    -- Either joining as a regular member
    role = 'member'
    -- Or the room was just created by this user (so they can be admin)
    OR (
      role = 'admin' 
      AND EXISTS (
        SELECT 1 FROM public.rooms 
        WHERE id = room_id 
        AND created_by = auth.uid()
      )
    )
  )
);

-- ====================================================
-- FIX 3: Allow room creators to SELECT their own room immediately after creation
-- ====================================================

-- Drop the existing SELECT policy 
DROP POLICY IF EXISTS "Users can view their own rooms" ON public.rooms;

-- Create a new SELECT policy that allows:
-- 1. Room members to view their rooms
-- 2. Room creators to view rooms they just created (before room_members is populated)
CREATE POLICY "Users can view rooms" 
ON public.rooms 
FOR SELECT 
TO authenticated 
USING (
  id IN (SELECT get_user_room_ids(auth.uid()))
  OR created_by = auth.uid()
);