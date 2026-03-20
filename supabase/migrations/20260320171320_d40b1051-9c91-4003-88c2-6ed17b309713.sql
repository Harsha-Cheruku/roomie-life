-- Allow any player in the lobby to update the lobby status to "finished"
DROP POLICY IF EXISTS "Host can update lobbies" ON public.game_lobbies;

CREATE POLICY "Players can update lobbies"
ON public.game_lobbies
FOR UPDATE
USING (
  host_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.game_lobby_players
    WHERE lobby_id = game_lobbies.id AND user_id = auth.uid()
  )
);