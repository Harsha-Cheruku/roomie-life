
-- Game sessions table for tracking wins/losses
CREATE TABLE public.game_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL, -- 'tictactoe', 'memory', 'reaction', 'dice'
  winner_id UUID, -- null for draws or solo games
  loser_id UUID, -- null for draws or solo games
  player_ids UUID[] NOT NULL DEFAULT '{}',
  result TEXT NOT NULL DEFAULT 'completed', -- 'completed', 'draw', 'abandoned'
  score JSONB DEFAULT '{}', -- flexible scoring: {"moves": 12, "time_ms": 340, "total": 7}
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Room members can view game sessions"
ON public.game_sessions FOR SELECT
USING (room_id IN (SELECT get_user_room_ids(auth.uid())));

CREATE POLICY "Room members can create game sessions"
ON public.game_sessions FOR INSERT
WITH CHECK (room_id IN (SELECT get_user_room_ids(auth.uid())));

-- Index for fast stats queries
CREATE INDEX idx_game_sessions_room_id ON public.game_sessions(room_id);
CREATE INDEX idx_game_sessions_winner ON public.game_sessions(winner_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions;
