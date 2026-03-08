
-- Fix 1: Reminders - only creator or allowed completers can update
DROP POLICY IF EXISTS "Room members can update reminders" ON public.reminders;
CREATE POLICY "Room members can update reminders"
ON public.reminders FOR UPDATE
USING (
  is_room_member(auth.uid(), room_id)
  AND (
    auth.uid() = created_by
    OR auth.uid() = user_id
    OR auth.uid() = ANY(allowed_completers)
  )
);

-- Fix 2: Game lobbies - only host can update
DROP POLICY IF EXISTS "Host or room members can update lobbies" ON public.game_lobbies;
CREATE POLICY "Host can update lobbies"
ON public.game_lobbies FOR UPDATE
USING (host_id = auth.uid());

-- Fix 3: Notifications - restrict type to known safe set
DROP POLICY IF EXISTS "Users can create notifications for room members" ON public.notifications;
CREATE POLICY "Users can create notifications for room members"
ON public.notifications FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND is_room_member(auth.uid(), room_id)
  AND is_room_member(user_id, room_id)
  AND type IN ('task', 'expense', 'reminder', 'alarm', 'chat', 'game', 'room', 'delete_request', 'delete_approved')
);
