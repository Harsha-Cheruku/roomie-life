
CREATE OR REPLACE FUNCTION public.start_game_lobby(
  _lobby_id uuid,
  _state jsonb,
  _first_turn_user_id uuid
)
RETURNS public.game_lobbies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _lobby public.game_lobbies;
  _is_host boolean;
  _first_is_player boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _lobby FROM public.game_lobbies WHERE id = _lobby_id FOR UPDATE;
  IF _lobby IS NULL THEN
    RAISE EXCEPTION 'Lobby not found';
  END IF;

  IF _lobby.host_id <> _uid THEN
    RAISE EXCEPTION 'Only host can start the game';
  END IF;

  IF _lobby.status = 'playing' THEN
    RETURN _lobby;
  END IF;

  IF _lobby.status <> 'waiting' THEN
    RAISE EXCEPTION 'Lobby is not in waiting state';
  END IF;

  -- Validate first turn user is in the lobby
  SELECT EXISTS (
    SELECT 1 FROM public.game_lobby_players
    WHERE lobby_id = _lobby_id AND user_id = _first_turn_user_id
  ) INTO _first_is_player;

  IF NOT _first_is_player THEN
    RAISE EXCEPTION 'First turn user is not in the lobby';
  END IF;

  UPDATE public.game_lobbies
  SET status = 'playing',
      current_turn_user_id = _first_turn_user_id,
      game_state = _state,
      updated_at = now()
  WHERE id = _lobby_id
  RETURNING * INTO _lobby;

  RETURN _lobby;
END;
$function$;
