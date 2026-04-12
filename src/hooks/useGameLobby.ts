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

const getErrorMessage = (error: any, fallback: string): string => {
  const message = typeof error?.message === "string" ? error.message : "";
  const normalized = message.toLowerCase();
  if (normalized.includes("failed to fetch") || normalized.includes("network") || normalized.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }
  if (normalized.includes("jwt") || normalized.includes("session") || normalized.includes("token")) {
    return "Session expired. Please sign in again.";
  }
  if (normalized.includes("row-level security") || normalized.includes("rls")) {
    return "Permission denied. You may need to rejoin the room.";
  }
  return message || fallback;
};

export const useGameLobby = () => {
  const { user, profile, currentRoom } = useAuth();
  const [lobby, setLobby] = useState<GameLobby | null>(null);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) return data.session;
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
      throw refreshError ?? new Error("Session expired. Please sign in again.");
    }
    return refreshed.session;
  }, []);

  const fetchPlayers = useCallback(async (lobbyId: string): Promise<LobbyPlayer[]> => {
    const { data, error } = await supabase
      .from("game_lobby_players")
      .select("*")
      .eq("lobby_id", lobbyId)
      .order("player_order");

    if (error) {
      console.error("Fetch players error:", error);
      return [];
    }

    const result = (data || []).map((p) => ({
      id: p.id,
      lobby_id: p.lobby_id,
      user_id: p.user_id,
      display_name: p.display_name,
      avatar: p.avatar || "😊",
      player_order: p.player_order,
      is_ready: p.is_ready,
      score: p.score,
      player_state: (p.player_state as Record<string, any>) || {},
      joined_at: p.joined_at,
    })) as LobbyPlayer[];

    setPlayers(result);
    return result;
  }, []);

  // Subscribe to lobby changes
  useEffect(() => {
    if (!lobby?.id) return;

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

  // Clear lobby if room changes
  useEffect(() => {
    if (lobby?.room_id && currentRoom?.id && lobby.room_id !== currentRoom.id) {
      setLobby(null);
      setPlayers([]);
    }
  }, [currentRoom?.id, lobby?.room_id]);

  // Restore joined lobby on mount
  useEffect(() => {
    if (!user?.id || !currentRoom?.id || lobby?.id) return;

    let cancelled = false;

    const restoreJoinedLobby = async () => {
      try {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

        const { data: joinedRows, error: joinedError } = await supabase
          .from("game_lobby_players")
          .select("lobby_id")
          .eq("user_id", user.id);

        if (joinedError || !joinedRows?.length || cancelled) return;

        const lobbyIds = [...new Set(joinedRows.map((row) => row.lobby_id))];

        const { data: activeLobbies, error: lobbyError } = await supabase
          .from("game_lobbies")
          .select("*")
          .in("id", lobbyIds)
          .eq("room_id", currentRoom.id)
          .in("status", ["waiting", "playing"])
          .gte("updated_at", twoHoursAgo)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (lobbyError || !activeLobbies?.length || cancelled) return;

        const activeLobby = activeLobbies[0] as unknown as GameLobby;
        setLobby(activeLobby);
        await fetchPlayers(activeLobby.id);
      } catch (error) {
        console.error("Restore lobby error:", error);
      }
    };

    void restoreJoinedLobby();
    return () => { cancelled = true; };
  }, [currentRoom?.id, fetchPlayers, lobby?.id, user?.id]);

  const createLobby = useCallback(
    async (gameType: string, maxPlayers: number = 4) => {
      if (!user || !profile || !currentRoom) {
        toast.error("Please log in and join a room first");
        return null;
      }
      setIsLoading(true);

      try {
        await refreshSession();

        // Clean up old waiting lobbies by this user in this room
        const { data: oldLobbies } = await supabase
          .from("game_lobbies")
          .select("id")
          .eq("room_id", currentRoom.id)
          .eq("host_id", user.id)
          .eq("status", "waiting");

        if (oldLobbies?.length) {
          const oldIds = oldLobbies.map((l) => l.id);
          await supabase
            .from("game_lobby_players")
            .delete()
            .eq("user_id", user.id)
            .in("lobby_id", oldIds);
          await supabase
            .from("game_lobbies")
            .delete()
            .eq("host_id", user.id)
            .eq("status", "waiting")
            .in("id", oldIds);
        }

        const { data: lobbyData, error: lobbyError } = await supabase
          .from("game_lobbies")
          .insert({
            room_id: currentRoom.id,
            game_type: gameType,
            host_id: user.id,
            max_players: maxPlayers,
            status: "waiting",
          })
          .select()
          .single();

        if (lobbyError) throw lobbyError;

        const newLobby: GameLobby = {
          id: lobbyData.id,
          room_id: lobbyData.room_id,
          game_type: lobbyData.game_type,
          join_code: lobbyData.join_code,
          host_id: lobbyData.host_id,
          status: lobbyData.status as GameLobby["status"],
          max_players: lobbyData.max_players,
          current_turn_user_id: lobbyData.current_turn_user_id,
          game_state: (lobbyData.game_state as Record<string, any>) || {},
          created_at: lobbyData.created_at,
          updated_at: lobbyData.updated_at,
        };

        // Host auto-joins
        const { error: joinError } = await supabase
          .from("game_lobby_players")
          .insert({
            lobby_id: newLobby.id,
            user_id: user.id,
            display_name: profile.display_name,
            avatar: profile.avatar || "😊",
            player_order: 0,
            is_ready: true,
          });

        if (joinError) throw joinError;

        setLobby(newLobby);
        await fetchPlayers(newLobby.id);
        return newLobby;
      } catch (e: any) {
        console.error("Create lobby error:", e);
        toast.error(getErrorMessage(e, "Failed to create game"));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [currentRoom, fetchPlayers, profile, refreshSession, user]
  );

  const joinLobby = useCallback(
    async (joinCode: string): Promise<GameLobby | null> => {
      if (!user || !profile) return null;
      setIsLoading(true);

      try {
        await refreshSession();

        const { data: lobbies, error: findError } = await supabase
          .from("game_lobbies")
          .select("*")
          .eq("join_code", joinCode.toUpperCase().trim())
          .eq("status", "waiting")
          .limit(1);

        if (findError) throw findError;
        if (!lobbies?.length) {
          toast.error("No open game found with that code");
          return null;
        }

        const foundLobby = lobbies[0] as unknown as GameLobby;

        // Check player count
        const { data: existingPlayers } = await supabase
          .from("game_lobby_players")
          .select("id")
          .eq("lobby_id", foundLobby.id);

        const playerCount = existingPlayers?.length || 0;
        if (playerCount >= foundLobby.max_players) {
          toast.error("Game is full!");
          return null;
        }

        // Check if already joined
        const { data: alreadyIn } = await supabase
          .from("game_lobby_players")
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
          .from("game_lobby_players")
          .insert({
            lobby_id: foundLobby.id,
            user_id: user.id,
            display_name: profile.display_name,
            avatar: profile.avatar || "😊",
            player_order: playerCount,
            is_ready: false,
          });

        if (joinError) throw joinError;

        setLobby(foundLobby);
        await fetchPlayers(foundLobby.id);
        toast.success("Joined the game!");
        return foundLobby;
      } catch (e: any) {
        console.error("Join lobby error:", e);
        toast.error(getErrorMessage(e, "Failed to join game"));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchPlayers, profile, refreshSession, user]
  );

  const setReady = useCallback(
    async (ready: boolean) => {
      if (!lobby || !user) return;
      try {
        await refreshSession();
        const { error } = await supabase
          .from("game_lobby_players")
          .update({ is_ready: ready })
          .eq("lobby_id", lobby.id)
          .eq("user_id", user.id);

        if (error) throw error;

        setPlayers((prev) =>
          prev.map((p) => (p.user_id === user.id ? { ...p, is_ready: ready } : p))
        );
      } catch (error) {
        toast.error(getErrorMessage(error, "Couldn't update ready state"));
      }
    },
    [lobby, refreshSession, user]
  );

  const startGame = useCallback(
    async (initialState: Record<string, any> = {}) => {
      if (!lobby || !user || lobby.host_id !== user.id) return false;

      try {
        await refreshSession();
        const freshPlayers = await fetchPlayers(lobby.id);

        if (freshPlayers.length < 2) {
          toast.error("Need at least 2 players!");
          return false;
        }
        if (!freshPlayers.every((p) => p.is_ready)) {
          toast.error("All players must be ready!");
          return false;
        }

        const { data: startedLobby, error } = await supabase
          .from("game_lobbies")
          .update({
            status: "playing" as string,
            current_turn_user_id: freshPlayers[0].user_id,
            game_state: initialState as any,
          })
          .eq("id", lobby.id)
          .select()
          .single();

        if (error) throw error;
        if (!startedLobby) throw new Error("Failed to start game - no data returned");

        const updatedLobby: GameLobby = {
          id: startedLobby.id,
          room_id: startedLobby.room_id,
          game_type: startedLobby.game_type,
          join_code: startedLobby.join_code,
          host_id: startedLobby.host_id,
          status: startedLobby.status as GameLobby["status"],
          max_players: startedLobby.max_players,
          current_turn_user_id: startedLobby.current_turn_user_id,
          game_state: (startedLobby.game_state as Record<string, any>) || {},
          created_at: startedLobby.created_at,
          updated_at: startedLobby.updated_at,
        };

        setLobby(updatedLobby);
        setPlayers(freshPlayers);
        return true;
      } catch (error) {
        console.error("Start game error:", error);
        toast.error(getErrorMessage(error, "Failed to start game"));
        return false;
      }
    },
    [fetchPlayers, lobby, refreshSession, user]
  );

  const updateGameState = useCallback(
    async (
      state: Record<string, any>,
      nextTurnUserId?: string,
      options?: { enforceTurn?: boolean }
    ) => {
      if (!lobby || !user) return false;

      try {
        await refreshSession();

        const shouldEnforceTurn = options?.enforceTurn ?? lobby.status === "playing";

        const { data, error } = await supabase.rpc("update_game_lobby_state", {
          _lobby_id: lobby.id,
          _state: state as any,
          _next_turn_user_id: nextTurnUserId ?? null,
          _expected_turn_user_id: shouldEnforceTurn ? user.id : null,
        });

        if (error) {
          console.error("Failed to update game state:", error);
          toast.error(getErrorMessage(error, "Sync error. Please try again."));
          return false;
        }

        if (!data) {
          toast.error(
            shouldEnforceTurn
              ? "Turn already moved. Syncing latest state..."
              : "Sync error. Please try again."
          );
          return false;
        }

        // Optimistic local update
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
      } catch (error) {
        console.error("Update game state error:", error);
        toast.error(getErrorMessage(error, "Sync error. Please try again."));
        return false;
      }
    },
    [lobby, refreshSession, user]
  );

  const updatePlayerState = useCallback(
    async (userId: string, playerState: Record<string, any>, score?: number) => {
      if (!lobby) return;
      try {
        await refreshSession();
        const update: Record<string, any> = { player_state: playerState as any };
        if (score !== undefined) update.score = score;

        await supabase
          .from("game_lobby_players")
          .update(update)
          .eq("lobby_id", lobby.id)
          .eq("user_id", userId);
      } catch (error) {
        console.error("Update player state error:", error);
      }
    },
    [lobby, refreshSession]
  );

  const endGame = useCallback(
    async (winnerId?: string) => {
      if (!lobby) return;
      try {
        await refreshSession();
        await supabase
          .from("game_lobbies")
          .update({ status: "finished" as string })
          .eq("id", lobby.id);
      } catch (error) {
        console.error("End game error:", error);
      }
    },
    [lobby, refreshSession]
  );

  const leaveLobby = useCallback(async () => {
    if (!lobby || !user) return;

    try {
      await refreshSession();

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      await supabase
        .from("game_lobby_players")
        .delete()
        .eq("lobby_id", lobby.id)
        .eq("user_id", user.id);

      if (lobby.host_id === user.id) {
        await supabase.from("game_lobbies").delete().eq("id", lobby.id);
      }

      setLobby(null);
      setPlayers([]);
    } catch (error) {
      console.error("Leave lobby error:", error);
    }
  }, [lobby, refreshSession, user]);

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

export type UseGameLobbyReturn = ReturnType<typeof useGameLobby>;
