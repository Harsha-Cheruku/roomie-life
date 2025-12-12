-- Add policy to allow authenticated users to find rooms by invite code (needed for joining)
CREATE POLICY "Users can find rooms by invite code" 
ON public.rooms 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Drop the existing restrictive policy and replace it
DROP POLICY IF EXISTS "Users can view rooms they are members of" ON public.rooms;