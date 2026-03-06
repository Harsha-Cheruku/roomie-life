
-- Game rooms/lobbies for multiplayer games
CREATE TABLE public.game_lobbies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  game_type text NOT NULL,
  join_code text NOT NULL DEFAULT upper(substring(md5(random()::text) from 1 for 6)),
  host_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'waiting', -- waiting, playing, finished
  max_players integer NOT NULL DEFAULT 4,
  current_turn_user_id uuid,
  game_state jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(join_code)
);

-- Players in a game lobby
CREATE TABLE public.game_lobby_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid NOT NULL REFERENCES public.game_lobbies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  avatar text DEFAULT '😊',
  player_order integer NOT NULL DEFAULT 0,
  is_ready boolean NOT NULL DEFAULT false,
  score integer NOT NULL DEFAULT 0,
  player_state jsonb DEFAULT '{}'::jsonb,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lobby_id, user_id)
);

-- Enable RLS
ALTER TABLE public.game_lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_lobby_players ENABLE ROW LEVEL SECURITY;

-- RLS policies for game_lobbies
CREATE POLICY "Room members can view lobbies" ON public.game_lobbies
  FOR SELECT USING (room_id IN (SELECT get_user_room_ids(auth.uid())));

CREATE POLICY "Room members can create lobbies" ON public.game_lobbies
  FOR INSERT WITH CHECK (
    room_id IN (SELECT get_user_room_ids(auth.uid()))
    AND host_id = auth.uid()
  );

CREATE POLICY "Host or room members can update lobbies" ON public.game_lobbies
  FOR UPDATE USING (room_id IN (SELECT get_user_room_ids(auth.uid())));

CREATE POLICY "Host can delete lobbies" ON public.game_lobbies
  FOR DELETE USING (host_id = auth.uid());

-- RLS policies for game_lobby_players
CREATE POLICY "Anyone in room can view lobby players" ON public.game_lobby_players
  FOR SELECT USING (
    lobby_id IN (
      SELECT id FROM public.game_lobbies 
      WHERE room_id IN (SELECT get_user_room_ids(auth.uid()))
    )
  );

CREATE POLICY "Users can join lobbies" ON public.game_lobby_players
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND lobby_id IN (
      SELECT id FROM public.game_lobbies 
      WHERE room_id IN (SELECT get_user_room_ids(auth.uid()))
      AND status = 'waiting'
    )
  );

CREATE POLICY "Users can update their own player state" ON public.game_lobby_players
  FOR UPDATE USING (
    user_id = auth.uid()
    OR lobby_id IN (
      SELECT id FROM public.game_lobbies 
      WHERE host_id = auth.uid()
    )
  );

CREATE POLICY "Users can leave lobbies" ON public.game_lobby_players
  FOR DELETE USING (user_id = auth.uid());

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_lobbies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_lobby_players;
