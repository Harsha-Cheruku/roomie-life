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
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message : "";
  const normalized = message.toLowerCase();
  if (code === "PGRST116" || normalized.includes("json object requested") || normalized.includes("0 rows")) {
    return "Game is already starting. Please wait a moment.";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("network") || normalized.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }
  if (normalized.includes("jwt") || normalized.includes("session") || normalized.includes("token")) {
    return "Session expired. Please sign in again.";
  }
  if (normalized.includes("row-level security") || normalized.includes("rls") || normalized.includes("policy")) {
    return "Permission denied. You may need to rejoin the room.";
  }
  if (normalized.includes("duplicate") || normalized.includes("unique")) {
    return "You're already in this game.";
  }
  return message || fallback;
};

const ensureSession = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return false;

    const expiresAt = data.session?.expires_at ? data.session.expires_at * 1000 : 0;
    const hasFreshSession = !!data.session && (!expiresAt || expiresAt - Date.now() > 60_000);

    if (hasFreshSession) return true;

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) return false;
    return !!refreshed.session;
  } catch {
    return false;
  }
};

const parseLobby = (data: any): GameLobby => ({
  id: data.id,
  room_id: data.room_id,
  game_type: data.game_type,
  join_code: data.join_code,
  host_id: data.host_id,
  status: data.status as GameLobby["status"],
  max_players: data.max_players,
  current_turn_user_id: data.current_turn_user_id,
  game_state: (data.game_state as Record<string, any>) || {},
  created_at: data.created_at,
  updated_at: data.updated_at,
});

const parsePlayer = (p: any): LobbyPlayer => ({
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
});

export const useGameLobby = () => {
  const { user, profile, currentRoom } = useAuth();
  const [lobby, setLobby] = useState<GameLobby | null>(null);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const startInFlightRef = useRef(false);

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

    const result = (data || []).map(parsePlayer);
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
            setLobby(parseLobby(payload.new));
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

        const activeLobby = parseLobby(activeLobbies[0]);
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

      const hasSession = await ensureSession();
      if (!hasSession) {
        toast.error("Session expired. Please sign in again.");
        return null;
      }

      setIsLoading(true);

      try {
        // Clean up ALL stale lobbies by this user in this room (waiting or finished)
        const { data: oldLobbies } = await supabase
          .from("game_lobbies")
          .select("id")
          .eq("room_id", currentRoom.id)
          .eq("host_id", user.id)
          .in("status", ["waiting", "finished"]);

        if (oldLobbies?.length) {
          const oldIds = oldLobbies.map((l) => l.id);
          // Delete players first, then lobbies
          for (const oldId of oldIds) {
            await supabase.from("game_lobby_players").delete().eq("lobby_id", oldId);
          }
          await supabase
            .from("game_lobbies")
            .delete()
            .eq("host_id", user.id)
            .in("status", ["waiting", "finished"])
            .eq("room_id", currentRoom.id);
        }

        // Also leave any other lobbies this user is in (to prevent conflicts)
        const { data: myOtherJoins } = await supabase
          .from("game_lobby_players")
          .select("lobby_id")
          .eq("user_id", user.id);

        if (myOtherJoins?.length) {
          await supabase
            .from("game_lobby_players")
            .delete()
            .eq("user_id", user.id);
        }

        // Clear local state
        setLobby(null);
        setPlayers([]);

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

        const newLobby = parseLobby(lobbyData);

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
        toast.success("Game created! Share the code with your roommates.");
        return newLobby;
      } catch (e: any) {
        console.error("Create lobby error:", e);
        toast.error(getErrorMessage(e, "Failed to create game. Try again."));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [currentRoom, fetchPlayers, profile, user]
  );

  const joinLobby = useCallback(
    async (joinCode: string): Promise<GameLobby | null> => {
      if (!user || !profile) {
        toast.error("Please log in first");
        return null;
      }

      const hasSession = await ensureSession();
      if (!hasSession) {
        toast.error("Session expired. Please sign in again.");
        return null;
      }

      setIsLoading(true);

      try {
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

        const foundLobby = parseLobby(lobbies[0]);

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
        toast.error(getErrorMessage(e, "Failed to join game. Try again."));
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
      try {
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
    [lobby, user]
  );

  const startGame = useCallback(
    async (initialState: Record<string, any> = {}) => {
      if (!lobby || !user || lobby.host_id !== user.id) {
        toast.error("Only the host can start the game");
        return false;
      }

      if (startInFlightRef.current) return false;
      startInFlightRef.current = true;
      setIsLoading(true);

      const hasSession = await ensureSession();
      if (!hasSession) {
        toast.error("Session expired. Please sign in again.");
        startInFlightRef.current = false;
        setIsLoading(false);
        return false;
      }

      try {
        const freshPlayers = await fetchPlayers(lobby.id);
        const firstPlayerId = freshPlayers[0]?.user_id;

        if (freshPlayers.length < 2 || !firstPlayerId) {
          toast.error("Need at least 2 players to start!");
          return false;
        }
        if (!freshPlayers.every((p) => p.is_ready)) {
          toast.error("All players must be ready!");
          return false;
        }

        // Optimistic UI: immediately show "playing" state for host
        const optimisticLobby: GameLobby = {
          ...lobby,
          status: "playing",
          current_turn_user_id: firstPlayerId,
          game_state: initialState,
        };
        setLobby(optimisticLobby);
        setPlayers(freshPlayers);

        const { error } = await supabase
          .from("game_lobbies")
          .update({
            status: "playing" as string,
            current_turn_user_id: firstPlayerId,
            game_state: initialState as any,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lobby.id)
          .eq("status", "waiting");

        if (error) {
          console.error("Start game DB error:", error);
          // Revert optimistic update
          setLobby(lobby);
          toast.error("Failed to start game. Try again.");
          return false;
        }

        toast.success("Game started! 🎮");
        return true;
      } catch (error) {
        console.error("Start game error:", error);
        // Revert optimistic update
        setLobby(lobby);
        toast.error(getErrorMessage(error, "Failed to start game. Try again."));
        return false;
      } finally {
        startInFlightRef.current = false;
        setIsLoading(false);
      }
    },
    [fetchPlayers, lobby, user]
  );

  const updateGameState = useCallback(
    async (
      state: Record<string, any>,
      nextTurnUserId?: string,
      options?: { enforceTurn?: boolean }
    ) => {
      if (!lobby || !user) return false;

      try {
        const shouldEnforceTurn = options?.enforceTurn ?? lobby.status === "playing";

        const { data, error } = await supabase.rpc("update_game_lobby_state", {
          _lobby_id: lobby.id,
          _state: state as any,
          _next_turn_user_id: nextTurnUserId ?? null,
          _expected_turn_user_id: shouldEnforceTurn ? user.id : null,
        });

        if (error) {
          console.error("Failed to update game state:", error);
          return false;
        }

        if (!data) {
          if (shouldEnforceTurn) {
            // Silently fail — turn likely moved
            return false;
          }
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
        return false;
      }
    },
    [lobby, user]
  );

  const updatePlayerState = useCallback(
    async (userId: string, playerState: Record<string, any>, score?: number) => {
      if (!lobby) return;
      try {
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
    [lobby]
  );

  const endGame = useCallback(
    async (winnerId?: string) => {
      if (!lobby) return;
      try {
        await supabase
          .from("game_lobbies")
          .update({ status: "finished" as string })
          .eq("id", lobby.id);
      } catch (error) {
        console.error("End game error:", error);
      }
    },
    [lobby]
  );

  const leaveLobby = useCallback(async () => {
    if (!lobby || !user) return;

    try {
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
        // Delete all players first, then the lobby
        await supabase.from("game_lobby_players").delete().eq("lobby_id", lobby.id);
        await supabase.from("game_lobbies").delete().eq("id", lobby.id);
      }

      setLobby(null);
      setPlayers([]);
    } catch (error) {
      console.error("Leave lobby error:", error);
    }
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

export type UseGameLobbyReturn = ReturnType<typeof useGameLobby>;
