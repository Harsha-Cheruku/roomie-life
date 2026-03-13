-- Secure RPC for multiplayer game state updates by active participants
CREATE OR REPLACE FUNCTION public.update_game_lobby_state(
  _lobby_id uuid,
  _state jsonb,
  _next_turn_user_id uuid DEFAULT NULL,
  _expected_turn_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_player boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.game_lobby_players glp
    WHERE glp.lobby_id = _lobby_id
      AND glp.user_id = _uid
  )
  INTO _is_player;

  IF NOT _is_player THEN
    RETURN false;
  END IF;

  -- If expected turn is provided, enforce turn ownership atomically.
  UPDATE public.game_lobbies
  SET
    game_state = COALESCE(_state, game_state),
    current_turn_user_id = COALESCE(_next_turn_user_id, current_turn_user_id),
    updated_at = now()
  WHERE id = _lobby_id
    AND (_expected_turn_user_id IS NULL OR current_turn_user_id = _expected_turn_user_id);

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_game_lobby_state(uuid, jsonb, uuid, uuid) TO authenticated;