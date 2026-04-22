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
const PLAYER_COLORS = [
  "hsl(var(--secondary))",
  "hsl(var(--primary))",
  "hsl(var(--mint))",
  "hsl(var(--lavender))",
  "hsl(var(--peach))",
  "hsl(var(--accent))",
];
const JUMP_CELLS = new Set([...Object.keys(SNAKES), ...Object.keys(LADDERS), ...Object.values(SNAKES), ...Object.values(LADDERS)].map(Number));

interface MoveResult {
  newPosition: number;
  message: string;
  won: boolean;
  skipTurn: boolean; // true if can't move (e.g. overshoot)
  extraTurn: boolean;
}

export function applyMove(currentPos: number, dice: number): MoveResult {
  const target = currentPos + dice;
  // Need exact roll to land on 100
  if (target > 100) {
    return { newPosition: currentPos, message: `Rolled ${dice} — overshot! Need exact roll.`, won: false, skipTurn: true, extraTurn: false };
  }

  const snakeEnd = SNAKES[target];
  const ladderEnd = LADDERS[target];
  const finalPosition = snakeEnd ?? ladderEnd ?? target;
  const won = finalPosition === 100;
  const extraTurn = dice === 6 && !won;
  const bonus = extraTurn ? " Roll 6 again!" : "";

  if (target === 100) {
    return { newPosition: 100, message: `🎉 Reached 100! WIN!`, won: true, skipTurn: false, extraTurn: false };
  }
  if (snakeEnd) {
    return { newPosition: snakeEnd, message: `🐍 Snake at ${target} → slid to ${snakeEnd}.${bonus}`, won: false, skipTurn: false, extraTurn };
  }
  if (ladderEnd) {
    return { newPosition: ladderEnd, message: won ? `🪜 Ladder at ${target} → 100! WIN!` : `🪜 Ladder at ${target} → climbed to ${ladderEnd}.${bonus}`, won, skipTurn: false, extraTurn };
  }
  return { newPosition: target, message: `Moved to ${target}.${bonus}`, won: false, skipTurn: false, extraTurn };
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

    // Determine next player. Official flow: rolling a 6 earns another turn unless the roll wins.
    const myIdx = activePlayers.findIndex((p) => p.user_id === user.id);
    const nextPlayer = result.extraTurn
      ? user.id
      : myIdx >= 0
        ? activePlayers[(myIdx + 1) % activePlayers.length]?.user_id
        : null;

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
  const getCellCenter = (n: number) => {
    const zeroBased = n - 1;
    const rowFromBottom = Math.floor(zeroBased / 10);
    const colInRow = zeroBased % 10;
    const col = rowFromBottom % 2 === 0 ? colInRow : 9 - colInRow;
    return { x: col * 10 + 5, y: (9 - rowFromBottom) * 10 + 5 };
  };
  const snakePaths = Object.entries(SNAKES).map(([from, to]) => {
    const start = getCellCenter(Number(from));
    const end = getCellCenter(to);
    const midY = (start.y + end.y) / 2;
    // First control point of the cubic Bézier — used to derive the body's initial tangent at `start`.
    const c1 = { x: start.x - 8, y: midY - 8 };
    const dx = c1.x - start.x;
    const dy = c1.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    // Tangent points away from the head, into the body. Rotate head so its "down" (tongue) faces this direction.
    const tangent = { x: dx / len, y: dy / len };
    // SVG rotation in degrees so the head's local +Y axis aligns with the body tangent.
    const headAngle = (Math.atan2(tangent.y, tangent.x) - Math.PI / 2) * (180 / Math.PI);
    return {
      from: Number(from),
      to,
      path: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${end.x + 8} ${midY + 8}, ${end.x} ${end.y}`,
      headAngle,
    };
  });
  const ladderLines = Object.entries(LADDERS).map(([from, to]) => ({ from: Number(from), to, start: getCellCenter(Number(from)), end: getCellCenter(to) }));

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
        <Trophy className="h-16 w-16 mx-auto text-accent" />
        <h2 className="text-2xl font-bold">🏆 {winner?.display_name || "Player"} wins!</h2>
        <div className="space-y-2 max-w-xs mx-auto">
          <h3 className="text-sm font-semibold text-muted-foreground">Final Ranking</h3>
          {ranking.map((p, i) => (
            <div
              key={p.user_id}
              className={cn(
                "flex justify-between items-center px-3 py-2 rounded-lg border",
                i === 0 ? "bg-accent/15 border-accent/35" : "bg-muted/30"
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
      <div className="rounded-xl overflow-hidden border-4 border-accent shadow-xl bg-accent/20">
        <div className="bg-accent text-center py-1">
          <span className="text-accent-foreground font-bold text-xs tracking-wider">SNAKES & LADDERS</span>
        </div>
        <div className="relative aspect-square bg-card">
          <div className="absolute inset-0 grid grid-cols-10 gap-0">
          {Array.from({ length: 10 }).map((_, row) =>
            Array.from({ length: 10 }).map((_, col) => {
              const n = getCellNumber(row, col);
              const isSnake = SNAKES[n] !== undefined;
              const isLadder = LADDERS[n] !== undefined;
              const isJumpTarget = JUMP_CELLS.has(n) && !isSnake && !isLadder;
              const here = playersAtCell(n);
              const even = (row + col) % 2 === 0;
              return (
                <div
                  key={n}
                  className={cn(
                    "aspect-square relative border border-foreground/10",
                    even ? "bg-accent/15" : "bg-accent/35",
                    n === 100 && "bg-yellow/70 ring-2 ring-accent ring-inset",
                    n === 1 && "bg-mint/45",
                    isJumpTarget && "bg-card/80"
                  )}
                >
                  <span className="absolute left-0.5 top-0.5 font-black text-[10px] leading-none text-foreground/70 z-10">{n}</span>
                  {isSnake && <span className="absolute bottom-0.5 right-0.5 text-[10px] leading-none z-10">🐍</span>}
                  {isLadder && <span className="absolute bottom-0.5 right-0.5 text-[10px] leading-none z-10">🪜</span>}
                  {n === 100 && <span className="absolute bottom-0.5 right-0.5 text-[10px] z-10">⭐</span>}
                  {here.length > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center z-20">
                      <div className="flex flex-wrap justify-center gap-[1px]">
                         {here.map((p) => {
                           const idx = activePlayers.indexOf(p);
                          return (
                            <div
                              key={p.user_id}
                              className="w-4 h-4 rounded-full flex items-center justify-center shadow-md border border-card"
                              style={{ backgroundColor: PLAYER_COLORS[idx] || "hsl(var(--muted-foreground))" }}
                              title={p.display_name}
                            >
                              <span className="text-[6px] text-primary-foreground font-bold">
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
          <svg className="absolute inset-0 h-full w-full pointer-events-none z-10" viewBox="0 0 100 100" aria-hidden="true">
            {ladderLines.map(({ from, to, start, end }) => {
              const dx = end.x - start.x;
              const dy = end.y - start.y;
              const length = Math.hypot(dx, dy) || 1;
              const offsetX = (-dy / length) * 1.15;
              const offsetY = (dx / length) * 1.15;
              return (
                <g key={`ladder-${from}-${to}`} stroke="hsl(var(--primary))" strokeLinecap="round">
                  <line x1={start.x + offsetX} y1={start.y + offsetY} x2={end.x + offsetX} y2={end.y + offsetY} strokeWidth="0.7" />
                  <line x1={start.x - offsetX} y1={start.y - offsetY} x2={end.x - offsetX} y2={end.y - offsetY} strokeWidth="0.7" />
                  {Array.from({ length: 6 }).map((_, i) => {
                    const t = (i + 1) / 7;
                    const x = start.x + dx * t;
                    const y = start.y + dy * t;
                    return <line key={i} x1={x + offsetX} y1={y + offsetY} x2={x - offsetX} y2={y - offsetY} strokeWidth="0.55" />;
                  })}
                </g>
              );
            })}
            {snakePaths.map(({ from, to, path, headAngle }) => {
              const head = getCellCenter(from);
              const tail = getCellCenter(to);
              return (
                <g key={`snake-${from}-${to}`}>
                  {/* Snake body */}
                  <path d={path} fill="none" stroke="hsl(var(--mint))" strokeWidth="2.6" strokeLinecap="round" opacity="0.95" />
                  <path d={path} fill="none" stroke="hsl(var(--foreground))" strokeWidth="0.55" strokeLinecap="round" strokeDasharray="1 3" opacity="0.45" />
                  {/* Tail tip */}
                  <circle cx={tail.x} cy={tail.y} r="0.9" fill="hsl(var(--mint))" stroke="hsl(var(--foreground))" strokeWidth="0.25" />
                  {/* Snake head — anchored at the from-cell center, rotated to face away from body */}
                  <g transform={`rotate(${headAngle} ${head.x} ${head.y})`}>
                    {/* Head shape (slightly oval, anchored on cell center) */}
                    <ellipse cx={head.x} cy={head.y} rx="2.2" ry="2.6" fill="hsl(var(--mint))" stroke="hsl(var(--foreground))" strokeWidth="0.5" />
                    {/* Eyes */}
                    <circle cx={head.x - 0.9} cy={head.y - 0.6} r="0.45" fill="hsl(var(--foreground))" />
                    <circle cx={head.x + 0.9} cy={head.y - 0.6} r="0.45" fill="hsl(var(--foreground))" />
                    <circle cx={head.x - 0.9} cy={head.y - 0.7} r="0.18" fill="hsl(var(--card))" />
                    <circle cx={head.x + 0.9} cy={head.y - 0.7} r="0.18" fill="hsl(var(--card))" />
                    {/* Forked tongue extending out the front of the head (away from body) */}
                    <path
                      d={`M ${head.x} ${head.y - 2.4} L ${head.x - 0.4} ${head.y - 3.4} M ${head.x} ${head.y - 2.4} L ${head.x + 0.4} ${head.y - 3.4}`}
                      stroke="hsl(var(--destructive))"
                      strokeWidth="0.3"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </g>
                </g>
              );
            })}
          </svg>
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
            <div className="w-3 h-3 rounded-full border border-card" style={{ backgroundColor: PLAYER_COLORS[i] }} />
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
