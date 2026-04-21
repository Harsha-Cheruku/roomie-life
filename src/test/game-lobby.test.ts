import { describe, expect, it } from "vitest";
import { applyMove } from "@/components/games/SnakesAndLadders";
import { buildStartGameState, normalizeLobbyPlayers, type LobbyPlayer } from "@/hooks/useGameLobby";

const makePlayer = (overrides: Partial<LobbyPlayer>): LobbyPlayer => ({
  id: overrides.id ?? crypto.randomUUID(),
  lobby_id: overrides.lobby_id ?? "lobby-1",
  user_id: overrides.user_id ?? crypto.randomUUID(),
  display_name: overrides.display_name ?? "Player",
  avatar: overrides.avatar ?? "😊",
  player_order: overrides.player_order ?? 0,
  is_ready: overrides.is_ready ?? true,
  score: overrides.score ?? 0,
  player_state: overrides.player_state ?? {},
  joined_at: overrides.joined_at ?? "2026-04-20T17:00:00.000Z",
});

describe("game lobby helpers", () => {
  it("deduplicates stale player rows by user and keeps the earliest stable order", () => {
    const players = normalizeLobbyPlayers([
      makePlayer({ id: "new", user_id: "u1", player_order: 2, joined_at: "2026-04-20T17:00:02.000Z" }),
      makePlayer({ id: "old", user_id: "u1", player_order: 0, joined_at: "2026-04-20T17:00:01.000Z" }),
      makePlayer({ id: "u2", user_id: "u2", player_order: 1, joined_at: "2026-04-20T17:00:03.000Z" }),
    ]);

    expect(players).toHaveLength(2);
    expect(players.map((player) => player.user_id)).toEqual(["u1", "u2"]);
    expect(players[0].id).toBe("old");
  });

  it("hydrates missing snakes state for every ordered player", () => {
    const state = buildStartGameState("snakes_and_ladders", {}, [
      { user_id: "u1", player_order: 1 },
      { user_id: "u2", player_order: 0 },
    ]);

    expect(state.positions).toEqual({ u2: 0, u1: 0 });
    expect(state.movesCount).toEqual({ u2: 0, u1: 0 });
    expect(state.message).toContain("Game started");
  });

  it("hydrates missing ludo player states with stable start offsets", () => {
    const state = buildStartGameState("ludo", {}, [
      { user_id: "u1", player_order: 0 },
      { user_id: "u2", player_order: 1 },
      { user_id: "u3", player_order: 2 },
    ]);

    expect(state.playerStates.u1.startOffset).toBe(0);
    expect(state.playerStates.u2.startOffset).toBe(13);
    expect(state.playerStates.u3.startOffset).toBe(26);
    expect(state.playerStates.u1.tokens).toHaveLength(4);
    expect(state.movesCount).toEqual({ u1: 0, u2: 0, u3: 0 });
  });

  it("applies snakes rules with exact finish, ladder-to-100 win, and six bonus turns", () => {
    expect(applyMove(97, 4)).toMatchObject({ newPosition: 97, won: false, skipTurn: true, extraTurn: false });
    expect(applyMove(79, 1)).toMatchObject({ newPosition: 100, won: true, skipTurn: false, extraTurn: false });
    expect(applyMove(10, 6)).toMatchObject({ newPosition: 6, won: false, skipTurn: false, extraTurn: true });
  });
});