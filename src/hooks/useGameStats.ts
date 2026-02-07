import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useGameStats = () => {
  const { currentRoom } = useAuth();

  const saveGameResult = useCallback(
    async (params: {
      gameType: string;
      winnerId?: string | null;
      loserId?: string | null;
      playerIds: string[];
      result: "completed" | "draw" | "abandoned";
      score?: Record<string, unknown>;
    }) => {
      if (!currentRoom?.id) return;

      try {
        const { error } = await supabase.from("game_sessions" as any).insert({
          room_id: currentRoom.id,
          game_type: params.gameType,
          winner_id: params.winnerId || null,
          loser_id: params.loserId || null,
          player_ids: params.playerIds,
          result: params.result,
          score: params.score || {},
        } as any);

        if (error) {
          console.error("Failed to save game result:", error);
        }
      } catch (e) {
        console.error("Error saving game result:", e);
      }
    },
    [currentRoom?.id]
  );

  return { saveGameResult };
};
