import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface LobbyPlayer {
  id: string;
  lobby_id: string;
  user_id: string;
  display_name: string;
  avatar: string;
  player_order: number;
  is_ready: boolean;
  score: number;
  player_state: Record<string, any>;
  joined_at: string;
}

export interface GameLobby {
  id: string;
  room_id: string;
  game_type: string;
  join_code: string;
  host_id: string;
  status: "waiting" | "playing" | "finished";
  max_players: number;
  current_turn_user_id: string | null;
  game_state: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export const useGameLobby = () => {
  const { user, profile, currentRoom } = useAuth();
  const [lobby, setLobby] = useState<GameLobby | null>(null);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchPlayers = useCallback(async (lobbyId: string): Promise<LobbyPlayer[]> => {
    const { data } = await supabase
      .from("game_lobby_players" as any)
      .select("*")
      .eq("lobby_id", lobbyId)
      .order("player_order");
    const result = (data as unknown as LobbyPlayer[]) || [];
    setPlayers(result);
    return result;
  }, []);

  // Subscribe to lobby changes
  useEffect(() => {
    if (!lobby?.id) return;

    // Cleanup previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const lobbyChannel = supabase
      .channel(`lobby-${lobby.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_lobbies", filter: `id=eq.${lobby.id}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const updated = payload.new as unknown as GameLobby;
            setLobby(updated);
          } else if (payload.eventType === "DELETE") {
            setLobby(null);
            setPlayers([]);
            toast.info("Game lobby was closed");
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_lobby_players", filter: `lobby_id=eq.${lobby.id}` },
        () => {
          fetchPlayers(lobby.id);
        }
      )
      .subscribe();

    channelRef.current = lobbyChannel;

    return () => {
      supabase.removeChannel(lobbyChannel);
      channelRef.current = null;
    };
  }, [fetchPlayers, lobby?.id]);

  useEffect(() => {
    if (lobby?.room_id && currentRoom?.id && lobby.room_id !== currentRoom.id) {
      setLobby(null);
      setPlayers([]);
    }
  }, [currentRoom?.id, lobby?.room_id]);

  useEffect(() => {
    if (!user?.id || !currentRoom?.id || lobby?.id) return;

    let cancelled = false;

    const restoreJoinedLobby = async () => {
      try {
        const { data: joinedRows, error: joinedError } = await supabase
          .from("game_lobby_players" as any)
          .select("lobby_id")
          .eq("user_id", user.id);

        if (joinedError) throw joinedError;

        const lobbyIds = Array.from(
          new Set(
            (((joinedRows as unknown as { lobby_id: string }[] | null) || [])
              .map((row) => row.lobby_id)
              .filter(Boolean))
          )
        );

        if (!lobbyIds.length || cancelled) return;

        const { data: activeLobbies, error: lobbyError } = await supabase
          .from("game_lobbies" as any)
          .select("*")
          .in("id", lobbyIds)
          .eq("room_id", currentRoom.id)
          .in("status", ["waiting", "playing"])
          .order("updated_at", { ascending: false })
          .limit(1);

        if (lobbyError) throw lobbyError;

        const activeLobby = (activeLobbies as unknown as GameLobby[])?.[0];
        if (!activeLobby || cancelled) return;

        setLobby(activeLobby);
        await fetchPlayers(activeLobby.id);
      } catch (error) {
        console.error("Restore lobby error:", error);
      }
    };

    void restoreJoinedLobby();

    return () => {
      cancelled = true;
    };
  }, [currentRoom?.id, fetchPlayers, lobby?.id, user?.id]);

  const createLobby = useCallback(
    async (gameType: string, maxPlayers: number = 4) => {
      if (!user || !profile || !currentRoom) return null;
      setIsLoading(true);

      try {
        const { data: lobbyData, error: lobbyError } = await supabase
          .from("game_lobbies" as any)
          .insert({
            room_id: currentRoom.id,
            game_type: gameType,
            host_id: user.id,
            max_players: maxPlayers,
            status: "waiting",
          } as any)
          .select()
          .single();

        if (lobbyError) throw lobbyError;
        const newLobby = lobbyData as unknown as GameLobby;

        // Host auto-joins
        const { error: joinError } = await supabase
          .from("game_lobby_players" as any)
          .insert({
            lobby_id: newLobby.id,
            user_id: user.id,
            display_name: profile.display_name,
            avatar: profile.avatar || "😊",
            player_order: 0,
            is_ready: true,
          } as any);

        if (joinError) throw joinError;

        setLobby(newLobby);
        await fetchPlayers(newLobby.id);
        return newLobby;
      } catch (e: any) {
        console.error("Create lobby error:", e);
        toast.error("Failed to create game");
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [currentRoom, fetchPlayers, profile, user]
  );

  const joinLobby = useCallback(
    async (joinCode: string): Promise<GameLobby | null> => {
      if (!user || !profile) return null;
      setIsLoading(true);

      try {
        const { data: lobbies, error: findError } = await supabase
          .from("game_lobbies" as any)
          .select("*")
          .eq("join_code", joinCode.toUpperCase().trim())
          .eq("status", "waiting")
          .limit(1);

        if (findError) throw findError;
        const foundLobby = (lobbies as unknown as GameLobby[])?.[0];

        if (!foundLobby) {
          toast.error("No open game found with that code");
          return null;
        }

        // Check player count
        const { data: existingPlayers } = await supabase
          .from("game_lobby_players" as any)
          .select("id")
          .eq("lobby_id", foundLobby.id);

        const playerCount = (existingPlayers as any[])?.length || 0;
        if (playerCount >= foundLobby.max_players) {
          toast.error("Game is full!");
          return null;
        }

        // Check if already joined
        const { data: alreadyIn } = await supabase
          .from("game_lobby_players" as any)
          .select("id")
          .eq("lobby_id", foundLobby.id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (alreadyIn) {
          setLobby(foundLobby);
          await fetchPlayers(foundLobby.id);
          return foundLobby;
        }

        const { error: joinError } = await supabase
          .from("game_lobby_players" as any)
          .insert({
            lobby_id: foundLobby.id,
            user_id: user.id,
            display_name: profile.display_name,
            avatar: profile.avatar || "😊",
            player_order: playerCount,
            is_ready: false,
          } as any);

        if (joinError) throw joinError;

        setLobby(foundLobby);
        await fetchPlayers(foundLobby.id);
        toast.success("Joined the game!");
        return foundLobby;
      } catch (e: any) {
        console.error("Join lobby error:", e);
        toast.error("Failed to join game");
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchPlayers, profile, user]
  );

  const setReady = useCallback(
    async (ready: boolean) => {
      if (!lobby || !user) return;
      await supabase
        .from("game_lobby_players" as any)
        .update({ is_ready: ready } as any)
        .eq("lobby_id", lobby.id)
        .eq("user_id", user.id);
    },
    [fetchPlayers, lobby, user]
  );

  const startGame = useCallback(
    async (initialState: Record<string, any> = {}) => {
      if (!lobby || !user || lobby.host_id !== user.id) return false;

      // Fetch fresh player data and use it directly (avoids stale state)
      const freshPlayers = await fetchPlayers(lobby.id);

      const allReady = freshPlayers.every((p) => p.is_ready);
      if (!allReady) {
        toast.error("All players must be ready!");
        return false;
      }
      if (freshPlayers.length < 2) {
        toast.error("Need at least 2 players!");
        return false;
      }

      const { error } = await supabase
        .from("game_lobbies" as any)
        .update({
          status: "playing",
          current_turn_user_id: freshPlayers[0].user_id,
          game_state: initialState,
        } as any)
        .eq("id", lobby.id);

      if (error) {
        toast.error("Failed to start game");
        return false;
      }
      return true;
    },
    [lobby, user]
  );

  const updateGameState = useCallback(
    async (
      state: Record<string, any>,
      nextTurnUserId?: string,
      options?: { enforceTurn?: boolean }
    ) => {
      if (!lobby || !user) return false;

      const shouldEnforceTurn = options?.enforceTurn ?? lobby.status === "playing";

      const { data, error } = await supabase.rpc("update_game_lobby_state" as any, {
        _lobby_id: lobby.id,
        _state: state,
        _next_turn_user_id: nextTurnUserId ?? null,
        _expected_turn_user_id: shouldEnforceTurn ? user.id : null,
      } as any);

      if (error || !data) {
        console.error("Failed to update game state:", error);
        toast.error(shouldEnforceTurn ? "Turn already moved. Syncing latest state..." : "Sync error. Please try again.");
        return false;
      }

      // Optimistic local update for instant UI response while realtime event arrives
      setLobby((prev) =>
        prev
          ? {
              ...prev,
              game_state: state,
              current_turn_user_id: nextTurnUserId ?? prev.current_turn_user_id,
            }
          : prev
      );

      return true;
    },
    [lobby, user]
  );

  const updatePlayerState = useCallback(
    async (userId: string, playerState: Record<string, any>, score?: number) => {
      if (!lobby) return;
      const update: any = { player_state: playerState };
      if (score !== undefined) update.score = score;

      await supabase
        .from("game_lobby_players" as any)
        .update(update)
        .eq("lobby_id", lobby.id)
        .eq("user_id", userId);
    },
    [lobby]
  );

  const endGame = useCallback(
    async (winnerId?: string) => {
      if (!lobby) return;
      await supabase
        .from("game_lobbies" as any)
        .update({ status: "finished" } as any)
        .eq("id", lobby.id);
    },
    [lobby]
  );

  const leaveLobby = useCallback(async () => {
    if (!lobby || !user) return;

    // Cleanup channel before leaving
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    await supabase
      .from("game_lobby_players" as any)
      .delete()
      .eq("lobby_id", lobby.id)
      .eq("user_id", user.id);

    // If host leaves, delete the lobby
    if (lobby.host_id === user.id) {
      await supabase.from("game_lobbies" as any).delete().eq("id", lobby.id);
    }

    setLobby(null);
    setPlayers([]);
  }, [lobby, user]);

  const isHost = lobby?.host_id === user?.id;
  const isMyTurn = lobby?.current_turn_user_id === user?.id;
  const myPlayer = players.find((p) => p.user_id === user?.id);

  return {
    lobby,
    players,
    isLoading,
    isHost,
    isMyTurn,
    myPlayer,
    createLobby,
    joinLobby,
    setReady,
    startGame,
    updateGameState,
    updatePlayerState,
    endGame,
    leaveLobby,
    setLobby,
    setPlayers,
    fetchPlayers,
  };
};
