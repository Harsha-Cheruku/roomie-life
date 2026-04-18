import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import type { UseGameLobbyReturn } from "@/hooks/useGameLobby";
import { useGameStats } from "@/hooks/useGameStats";
import { GameLobbyComponent } from "./GameLobby";
import { Dices, Trophy, ArrowLeft, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Rules engine (pure functions, fully unit-testable) ────────────────────
const SNAKES: Record<number, number> = {
  16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78,
};
const LADDERS: Record<number, number> = {
  1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100,
};
const PLAYER_COLORS = ["#EF4444", "#3B82F6", "#22C55E", "#A855F7", "#F97316", "#EC4899"];

interface MoveResult {
  newPosition: number;
  message: string;
  won: boolean;
  skipTurn: boolean; // true if can't move (e.g. overshoot)
}

function applyMove(currentPos: number, dice: number): MoveResult {
  const target = currentPos + dice;
  // Need exact roll to land on 100
  if (target > 100) {
    return { newPosition: currentPos, message: `Rolled ${dice} — overshot! Need exact roll.`, won: false, skipTurn: true };
  }
  if (target === 100) {
    return { newPosition: 100, message: `🎉 Reached 100! WIN!`, won: true, skipTurn: false };
  }
  if (SNAKES[target]) {
    return { newPosition: SNAKES[target], message: `🐍 Snake at ${target} → slid to ${SNAKES[target]}`, won: false, skipTurn: false };
  }
  if (LADDERS[target]) {
    return { newPosition: LADDERS[target], message: `🪜 Ladder at ${target} → climbed to ${LADDERS[target]}`, won: false, skipTurn: false };
  }
  return { newPosition: target, message: `Moved to ${target}`, won: false, skipTurn: false };
}

// ─── Component ─────────────────────────────────────────────────────────────
interface Props { onBack: () => void; gameLobby: UseGameLobbyReturn; }

interface GameState {
  positions: Record<string, number>;
  winner: string | null;
  lastDice: number | null;
  message: string;
  movesCount: Record<string, number>;
}

export const SnakesAndLadders = ({ onBack, gameLobby }: Props) => {
  const { user } = useAuth();
  const { saveGameResult } = useGameStats();
  const { lobby, players } = gameLobby;
  const activeLobby = lobby?.game_type === "snakes_and_ladders" ? lobby : null;
  const activePlayers = activeLobby ? players : [];
  const isHost = activeLobby?.host_id === user?.id;
  const isMyTurn = activeLobby?.current_turn_user_id === user?.id;

  // Local UI state
  const [rolling, setRolling] = useState(false);
  const [diceDisplay, setDiceDisplay] = useState<number | null>(null);
  const actionInFlightRef = useRef(false);

  // Server-derived state (single source of truth)
  const gameState: GameState = {
    positions: activeLobby?.game_state?.positions || {},
    winner: activeLobby?.game_state?.winner || null,
    lastDice: activeLobby?.game_state?.lastDice || null,
    message: activeLobby?.game_state?.message || "",
    movesCount: activeLobby?.game_state?.movesCount || {},
  };

  // Sync dice display when server updates
  useEffect(() => {
    if (gameState.lastDice && !rolling) setDiceDisplay(gameState.lastDice);
  }, [gameState.lastDice, rolling]);

  useEffect(() => {
    actionInFlightRef.current = false;
  }, [activeLobby?.current_turn_user_id, activeLobby?.game_state]);

  const handleCreateGame = useCallback(async () => {
    await gameLobby.createLobby("snakes_and_ladders", 6);
  }, [gameLobby]);

  const handleStartGame = useCallback(async () => {
    const initialPositions: Record<string, number> = {};
    const initialMoves: Record<string, number> = {};
    players.forEach((p) => {
      initialPositions[p.user_id] = 0;
      initialMoves[p.user_id] = 0;
    });
    await gameLobby.startGame({
      positions: initialPositions,
      winner: null,
      lastDice: null,
      message: "Game started! Roll the dice.",
      movesCount: initialMoves,
    } satisfies GameState);
  }, [gameLobby, players]);

  const handleRollDice = useCallback(async () => {
    // Triple-guard: turn check, in-flight, winner
    if (!isMyTurn || actionInFlightRef.current || gameState.winner || rolling || !user) return;
    if (!activeLobby) return;

    actionInFlightRef.current = true;
    setRolling(true);

    // Animate dice roll briefly
    const finalDice = Math.floor(Math.random() * 6) + 1;
    let frames = 0;
    const interval = setInterval(() => {
      setDiceDisplay(Math.floor(Math.random() * 6) + 1);
      frames++;
      if (frames >= 6) {
        clearInterval(interval);
        setDiceDisplay(finalDice);
        setRolling(false);
        void commitMove(finalDice);
      }
    }, 80);
  }, [activeLobby, isMyTurn, gameState.winner, rolling, user]);

  const commitMove = async (dice: number) => {
    if (!user || !activeLobby) {
      actionInFlightRef.current = false;
      return;
    }

    const currentPos = gameState.positions[user.id] || 0;
    const result = applyMove(currentPos, dice);

    const newPositions = { ...gameState.positions, [user.id]: result.newPosition };
    const newMoves = { ...gameState.movesCount, [user.id]: (gameState.movesCount[user.id] || 0) + 1 };

    // Determine next player
    const myIdx = activePlayers.findIndex((p) => p.user_id === user.id);
    const nextPlayer = myIdx >= 0 ? activePlayers[(myIdx + 1) % activePlayers.length]?.user_id : null;

    const newState: GameState = {
      positions: newPositions,
      winner: result.won ? user.id : null,
      lastDice: dice,
      message: result.message,
      movesCount: newMoves,
    };

    const success = await gameLobby.updateGameState(newState, result.won ? user.id : nextPlayer);

    if (success && result.won) {
      await gameLobby.endGame(user.id);
      saveGameResult({
        gameType: "snakes_and_ladders",
        winnerId: user.id,
        playerIds: activePlayers.map((p) => p.user_id),
        result: "completed",
        score: { final_position: 100, moves: newMoves[user.id] },
      });
      toast.success("🏆 You won!");
    }

    actionInFlightRef.current = false;
  };

  // Cell number from row/col on a 10x10 board (snake-pattern)
  const getCellNumber = (row: number, col: number) => {
    const r = 9 - row;
    return r % 2 === 0 ? r * 10 + col + 1 : r * 10 + (9 - col) + 1;
  };

  const playersAtCell = (n: number) => activePlayers.filter((p) => (gameState.positions[p.user_id] || 0) === n);
  const diceEmoji = (v: number) => ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][v - 1];
  const currentTurnPlayer = activePlayers.find((p) => p.user_id === activeLobby?.current_turn_user_id);

  // ─── Pre-lobby ───
  if (!activeLobby) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">🐍 Snakes & Ladders</h2>
          <p className="text-sm text-muted-foreground">2-6 players • Turn-based</p>
        </div>
        <div className="space-y-3">
          <Button onClick={handleCreateGame} className="w-full gradient-primary" disabled={gameLobby.isLoading}>
            Create Game
          </Button>
          <JoinInput onJoin={(c) => gameLobby.joinLobby(c)} isLoading={gameLobby.isLoading} />
          <Button variant="outline" onClick={onBack} className="w-full">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </div>
      </div>
    );
  }

  // ─── Lobby waiting ───
  if (activeLobby.status === "waiting") {
    return (
      <GameLobbyComponent
        lobby={activeLobby}
        players={activePlayers}
        isHost={isHost}
        isLoading={gameLobby.isLoading}
        maxPlayers={6}
        gameName="🐍 Snakes & Ladders"
        minPlayers={2}
        onReady={(r) => gameLobby.setReady(r)}
        onStart={handleStartGame}
        onLeave={gameLobby.leaveLobby}
      />
    );
  }

  // ─── Finished — Result screen ───
  if (gameState.winner || activeLobby.status === "finished") {
    const winner = activePlayers.find((p) => p.user_id === gameState.winner);
    const ranking = [...activePlayers].sort(
      (a, b) => (gameState.positions[b.user_id] || 0) - (gameState.positions[a.user_id] || 0)
    );
    return (
      <div className="space-y-4 text-center py-4">
        <Trophy className="h-16 w-16 mx-auto text-yellow-500" />
        <h2 className="text-2xl font-bold">🏆 {winner?.display_name || "Player"} wins!</h2>
        <div className="space-y-2 max-w-xs mx-auto">
          <h3 className="text-sm font-semibold text-muted-foreground">Final Ranking</h3>
          {ranking.map((p, i) => (
            <div
              key={p.user_id}
              className={cn(
                "flex justify-between items-center px-3 py-2 rounded-lg border",
                i === 0 ? "bg-yellow-500/10 border-yellow-500/30" : "bg-muted/30"
              )}
            >
              <span className="text-sm font-medium">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`} {p.display_name}
              </span>
              <Badge variant="outline">
                Sq {gameState.positions[p.user_id] || 0} • {gameState.movesCount[p.user_id] || 0} moves
              </Badge>
            </div>
          ))}
        </div>
        <Button onClick={gameLobby.leaveLobby} className="w-full gradient-primary">
          <RotateCcw className="h-4 w-4 mr-2" /> Back to Menu
        </Button>
      </div>
    );
  }

  // ─── Playing ───
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🐍 Snakes & Ladders</h2>
        <Badge variant={isMyTurn ? "default" : "secondary"} className={cn(isMyTurn && "animate-pulse")}>
          {isMyTurn ? "Your turn!" : `${currentTurnPlayer?.display_name || "..."}'s turn`}
        </Badge>
      </div>

      {/* Board */}
      <div className="rounded-xl overflow-hidden border-4 border-amber-700 shadow-xl bg-amber-300">
        <div className="bg-amber-600 text-center py-1">
          <span className="text-white font-bold text-xs tracking-wider">SNAKES & LADDERS</span>
        </div>
        <div className="grid grid-cols-10 gap-0">
          {Array.from({ length: 10 }).map((_, row) =>
            Array.from({ length: 10 }).map((_, col) => {
              const n = getCellNumber(row, col);
              const isSnake = SNAKES[n] !== undefined;
              const isLadder = LADDERS[n] !== undefined;
              const here = playersAtCell(n);
              const even = (row + col) % 2 === 0;
              return (
                <div
                  key={n}
                  className={cn(
                    "aspect-square flex flex-col items-center justify-center relative border border-amber-500/30",
                    even ? "bg-amber-200" : "bg-amber-400",
                    n === 100 && "bg-yellow-300 ring-2 ring-yellow-500 ring-inset",
                    n === 1 && "bg-green-300"
                  )}
                >
                  <span className="font-bold text-[8px] text-amber-800/60 leading-none z-10">{n}</span>
                  {isSnake && <span className="text-[11px] leading-none z-10">🐍</span>}
                  {isLadder && <span className="text-[11px] leading-none z-10">🪜</span>}
                  {n === 100 && <span className="text-[10px]">⭐</span>}
                  {here.length > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center z-20">
                      <div className="flex flex-wrap justify-center gap-[1px]">
                         {here.map((p) => {
                           const idx = activePlayers.indexOf(p);
                          return (
                            <div
                              key={p.user_id}
                              className="w-4 h-4 rounded-full flex items-center justify-center shadow-md border border-white/50"
                              style={{ backgroundColor: PLAYER_COLORS[idx] || "#999" }}
                              title={p.display_name}
                            >
                              <span className="text-[6px] text-white font-bold">
                                {p.display_name?.charAt(0)?.toUpperCase()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Player chips */}
      <div className="flex flex-wrap gap-2">
        {activePlayers.map((p, i) => (
          <Badge
            key={p.user_id}
            variant="outline"
            className={cn(
              "text-xs gap-1 py-1",
               activeLobby.current_turn_user_id === p.user_id && "ring-2 ring-primary shadow-md"
            )}
          >
            <div className="w-3 h-3 rounded-full border border-white/50" style={{ backgroundColor: PLAYER_COLORS[i] }} />
            <span>
              {p.display_name}: <strong>{gameState.positions[p.user_id] || 0}</strong>
            </span>
          </Badge>
        ))}
      </div>

      {gameState.message && (
        <div className="text-center text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          {gameState.message}
        </div>
      )}

      {/* Dice + Action */}
      <div className="flex items-center gap-3">
        {diceDisplay && <div className={cn("text-5xl", rolling && "animate-bounce")}>{diceEmoji(diceDisplay)}</div>}
        <div className="flex-1 space-y-2">
          <Button
            onClick={handleRollDice}
            disabled={!isMyTurn || rolling || actionInFlightRef.current}
            className="w-full gradient-primary"
          >
            <Dices className="h-4 w-4 mr-2" />
            {rolling ? "Rolling..." : isMyTurn ? "Roll Dice" : "Wait your turn"}
          </Button>
          <Button variant="outline" onClick={gameLobby.leaveLobby} size="sm" className="w-full">
            Leave Game
          </Button>
        </div>
      </div>
    </div>
  );
};

const JoinInput = ({ onJoin, isLoading }: { onJoin: (code: string) => Promise<unknown>; isLoading: boolean }) => {
  const [code, setCode] = useState("");
  return (
    <div className="flex gap-2">
      <Input
        placeholder="Enter game code..."
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        className="flex-1 font-mono tracking-wider"
        maxLength={6}
      />
      <Button onClick={async () => { if (await onJoin(code)) setCode(""); }} disabled={!code.trim() || isLoading}>
        Join
      </Button>
    </div>
  );
};
