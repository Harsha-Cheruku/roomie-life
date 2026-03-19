import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useGameLobby } from "@/hooks/useGameLobby";
import { useGameStats } from "@/hooks/useGameStats";
import { GameLobbyComponent } from "./GameLobby";
import { Dices, Trophy, ArrowLeft, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Ludo King style: Red (top-left), Green (top-right), Yellow (bottom-right), Blue (bottom-left)
const PLAYER_COLORS = {
  bg: ["#E53935", "#43A047", "#FDD835", "#1E88E5"],
  light: ["#FFCDD2", "#C8E6C9", "#FFF9C4", "#BBDEFB"],
  mid: ["#EF9A9A", "#A5D6A7", "#FFF176", "#90CAF9"],
  dark: ["#C62828", "#2E7D32", "#F9A825", "#1565C0"],
  token: ["#D32F2F", "#388E3C", "#F9A825", "#1976D2"],
  tokenLight: ["#FF8A80", "#69F0AE", "#FFD740", "#82B1FF"],
};
const PLAYER_EMOJIS = ["🔴", "🟢", "🟡", "🔵"];
const PLAYER_NAMES = ["Red", "Green", "Yellow", "Blue"];

const BOARD_SIZE = 52;
const HOME_STRETCH = 6;
const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

// 52 path positions mapped to [row, col] on a 15x15 grid
const PATH_GRID: [number, number][] = [
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],[0,8],
  [1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],[8,14],
  [8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],[14,6],
  [13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],[6,0],
];

const HOME_STRETCH_GRID: [number, number][][] = [
  [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
];

const HOME_TOKEN_POS: [number, number][][] = [
  [[1.5,1.5],[1.5,3.5],[3.5,1.5],[3.5,3.5]],
  [[1.5,10.5],[1.5,12.5],[3.5,10.5],[3.5,12.5]],
  [[10.5,10.5],[10.5,12.5],[12.5,10.5],[12.5,12.5]],
  [[10.5,1.5],[10.5,3.5],[12.5,1.5],[12.5,3.5]],
];

const STAR_POSITIONS = new Set(SAFE_SQUARES.filter(s => s > 0));
const START_ABS = [1, 14, 27, 40];

interface LudoToken { position: number; isFinished: boolean; }
interface LudoPlayerState { tokens: LudoToken[]; startOffset: number; }
interface LudoGameProps { onBack: () => void; }

const getAbsolutePosition = (relPos: number, startOffset: number): number => {
  if (relPos === 0 || relPos > BOARD_SIZE) return -1;
  return ((relPos - 1 + startOffset) % BOARD_SIZE) + 1;
};

// Get pixel position for a token on the board
const getTokenPosition = (
  token: LudoToken, playerIdx: number, tokenIdx: number, startOffset: number, boardSize: number
): { x: number; y: number } | null => {
  const cellSize = boardSize / 15;
  
  if (token.isFinished) {
    // Center area
    return { x: 7 * cellSize + cellSize / 2, y: 7 * cellSize + cellSize / 2 };
  }
  
  if (token.position === 0) {
    // Home base
    const [r, c] = HOME_TOKEN_POS[playerIdx][tokenIdx];
    return { x: c * cellSize + cellSize / 2, y: r * cellSize + cellSize / 2 };
  }
  
  if (token.position > BOARD_SIZE) {
    const stretchIdx = token.position - BOARD_SIZE - 1;
    const pos = HOME_STRETCH_GRID[playerIdx][stretchIdx];
    if (!pos) return null;
    return { x: pos[1] * cellSize + cellSize / 2, y: pos[0] * cellSize + cellSize / 2 };
  }
  
  const abs = getAbsolutePosition(token.position, startOffset);
  if (abs >= 1 && abs <= 52) {
    const [r, c] = PATH_GRID[abs - 1];
    return { x: c * cellSize + cellSize / 2, y: r * cellSize + cellSize / 2 };
  }
  return null;
};

// ─── Board Component ───────────────────────────────────
interface BoardProps {
  players: { user_id: string; display_name: string }[];
  playerStates: Record<string, LudoPlayerState>;
  currentUserId?: string;
  isMyTurn: boolean;
  hasRolled: boolean;
  diceValue: number | null;
  canMoveToken: (token: LudoToken, dice: number) => boolean;
  onTokenClick: (tokenIdx: number) => void;
  moveInProgress: boolean;
}

const LudoBoard = ({
  players, playerStates, currentUserId, isMyTurn, hasRolled, diceValue,
  canMoveToken, onTokenClick, moveInProgress,
}: BoardProps) => {
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState(340);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setBoardSize(w);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const cellSize = boardSize / 15;
  const myPlayerIdx = players.findIndex(p => p.user_id === currentUserId);
  const myState = currentUserId ? playerStates[currentUserId] : undefined;

  // Collect all tokens with positions
  const allTokens = useMemo(() => {
    const tokens: { playerIdx: number; tokenIdx: number; x: number; y: number; isClickable: boolean }[] = [];
    players.forEach((p, pIdx) => {
      const state = playerStates[p.user_id];
      if (!state) return;
      state.tokens.forEach((token, tIdx) => {
        const pos = getTokenPosition(token, pIdx, tIdx, state.startOffset, boardSize);
        if (!pos) return;
        const clickable = isMyTurn && hasRolled && !moveInProgress &&
          pIdx === myPlayerIdx && !!diceValue && !!myState &&
          canMoveToken(myState.tokens[tIdx], diceValue);
        tokens.push({ playerIdx: pIdx, tokenIdx: tIdx, x: pos.x, y: pos.y, isClickable: clickable });
      });
    });
    return tokens;
  }, [players, playerStates, boardSize, isMyTurn, hasRolled, moveInProgress, myPlayerIdx, diceValue, myState, canMoveToken]);

  return (
    <div ref={boardRef} className="w-full max-w-[360px] mx-auto">
      <svg viewBox={`0 0 ${boardSize} ${boardSize}`} className="w-full rounded-2xl shadow-xl overflow-hidden" style={{ border: '3px solid hsl(var(--border))' }}>
        {/* Board background */}
        <rect width={boardSize} height={boardSize} fill="white" />
        
        {/* Home bases - large colored squares */}
        <rect x={0} y={0} width={cellSize * 6} height={cellSize * 6} fill={PLAYER_COLORS.bg[0]} rx={cellSize * 0.3} />
        <rect x={cellSize * 9} y={0} width={cellSize * 6} height={cellSize * 6} fill={PLAYER_COLORS.bg[1]} rx={cellSize * 0.3} />
        <rect x={cellSize * 9} y={cellSize * 9} width={cellSize * 6} height={cellSize * 6} fill={PLAYER_COLORS.bg[2]} rx={cellSize * 0.3} />
        <rect x={0} y={cellSize * 9} width={cellSize * 6} height={cellSize * 6} fill={PLAYER_COLORS.bg[3]} rx={cellSize * 0.3} />

        {/* Inner white areas for token homes */}
        {[
          [cellSize * 0.8, cellSize * 0.8],
          [cellSize * 9.8, cellSize * 0.8],
          [cellSize * 9.8, cellSize * 9.8],
          [cellSize * 0.8, cellSize * 9.8],
        ].map(([x, y], i) => (
          <rect key={`home-inner-${i}`} x={x} y={y} width={cellSize * 4.4} height={cellSize * 4.4} fill="white" rx={cellSize * 0.2} />
        ))}

        {/* Home token circles (outlines for empty slots) */}
        {HOME_TOKEN_POS.map((positions, pIdx) =>
          positions.map(([r, c], tIdx) => (
            <circle
              key={`home-slot-${pIdx}-${tIdx}`}
              cx={c * cellSize + cellSize / 2}
              cy={r * cellSize + cellSize / 2}
              r={cellSize * 0.45}
              fill={PLAYER_COLORS.light[pIdx]}
              stroke={PLAYER_COLORS.bg[pIdx]}
              strokeWidth={1.5}
            />
          ))
        )}

        {/* Path cells */}
        {PATH_GRID.map(([r, c], i) => {
          const absPos = i + 1;
          const startPlayer = START_ABS.indexOf(absPos);
          const isSafe = STAR_POSITIONS.has(absPos);
          const x = c * cellSize;
          const y = r * cellSize;
          
          return (
            <g key={`path-${i}`}>
              <rect
                x={x + 0.5} y={y + 0.5}
                width={cellSize - 1} height={cellSize - 1}
                fill={startPlayer >= 0 ? PLAYER_COLORS.mid[startPlayer] : "white"}
                stroke="#e0e0e0"
                strokeWidth={0.5}
                rx={1}
              />
              {isSafe && (
                <text
                  x={x + cellSize / 2} y={y + cellSize / 2 + 1}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={cellSize * 0.5} fill="#FFB300"
                >★</text>
              )}
              {startPlayer >= 0 && (
                <text
                  x={x + cellSize / 2} y={y + cellSize / 2 + 1}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={cellSize * 0.35} fill={PLAYER_COLORS.dark[startPlayer]}
                  fontWeight="bold"
                >▶</text>
              )}
            </g>
          );
        })}

        {/* Home stretch cells */}
        {HOME_STRETCH_GRID.map((positions, pIdx) =>
          positions.map(([r, c], sIdx) => (
            <rect
              key={`stretch-${pIdx}-${sIdx}`}
              x={c * cellSize + 0.5} y={r * cellSize + 0.5}
              width={cellSize - 1} height={cellSize - 1}
              fill={PLAYER_COLORS.light[pIdx]}
              stroke={PLAYER_COLORS.mid[pIdx]}
              strokeWidth={0.5}
              rx={1}
            />
          ))
        )}

        {/* Center triangle area */}
        <polygon
          points={`${7.5 * cellSize},${6 * cellSize} ${9 * cellSize},${7.5 * cellSize} ${7.5 * cellSize},${9 * cellSize} ${6 * cellSize},${7.5 * cellSize}`}
          fill="white" stroke="#e0e0e0" strokeWidth={0.5}
        />
        {/* Four colored triangles pointing to center */}
        <polygon points={`${6 * cellSize},${6 * cellSize} ${9 * cellSize},${6 * cellSize} ${7.5 * cellSize},${7.5 * cellSize}`} fill={PLAYER_COLORS.bg[1]} opacity={0.8} />
        <polygon points={`${9 * cellSize},${6 * cellSize} ${9 * cellSize},${9 * cellSize} ${7.5 * cellSize},${7.5 * cellSize}`} fill={PLAYER_COLORS.bg[2]} opacity={0.8} />
        <polygon points={`${6 * cellSize},${9 * cellSize} ${9 * cellSize},${9 * cellSize} ${7.5 * cellSize},${7.5 * cellSize}`} fill={PLAYER_COLORS.bg[3]} opacity={0.8} />
        <polygon points={`${6 * cellSize},${6 * cellSize} ${6 * cellSize},${9 * cellSize} ${7.5 * cellSize},${7.5 * cellSize}`} fill={PLAYER_COLORS.bg[0]} opacity={0.8} />

        {/* Tokens */}
        {allTokens.map((t, i) => {
          const r = cellSize * 0.38;
          return (
            <g
              key={`token-${t.playerIdx}-${t.tokenIdx}`}
              onClick={t.isClickable ? () => onTokenClick(t.tokenIdx) : undefined}
              style={{ cursor: t.isClickable ? 'pointer' : 'default' }}
            >
              {/* Shadow */}
              <circle cx={t.x + 1} cy={t.y + 2} r={r} fill="rgba(0,0,0,0.15)" />
              {/* Token body */}
              <circle cx={t.x} cy={t.y} r={r} fill={PLAYER_COLORS.token[t.playerIdx]} stroke="white" strokeWidth={2} />
              {/* Glossy highlight */}
              <circle cx={t.x - r * 0.2} cy={t.y - r * 0.25} r={r * 0.35} fill={PLAYER_COLORS.tokenLight[t.playerIdx]} opacity={0.5} />
              {/* Token number */}
              <text
                x={t.x} y={t.y + 1}
                textAnchor="middle" dominantBaseline="central"
                fontSize={r * 0.9} fontWeight="bold" fill="white"
              >{t.tokenIdx + 1}</text>
              {/* Clickable pulse ring */}
              {t.isClickable && (
                <circle cx={t.x} cy={t.y} r={r + 3} fill="none" stroke={PLAYER_COLORS.bg[t.playerIdx]} strokeWidth={2} opacity={0.7}>
                  <animate attributeName="r" values={`${r + 2};${r + 6};${r + 2}`} dur="1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;0.2;0.7" dur="1s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// Dice component with 3D look
const DiceFace = ({ value, rolling }: { value: number; rolling: boolean }) => {
  const dots: [number, number][] = {
    1: [[50,50]],
    2: [[25,25],[75,75]],
    3: [[25,25],[50,50],[75,75]],
    4: [[25,25],[75,25],[25,75],[75,75]],
    5: [[25,25],[75,25],[50,50],[25,75],[75,75]],
    6: [[25,25],[75,25],[25,50],[75,50],[25,75],[75,75]],
  }[value] || [];

  return (
    <div className={cn(
      "w-16 h-16 rounded-xl bg-white shadow-lg border-2 border-border flex items-center justify-center relative",
      rolling && "animate-spin"
    )} style={{ background: 'linear-gradient(145deg, #fff, #f0f0f0)' }}>
      <svg viewBox="0 0 100 100" className="w-12 h-12">
        {dots.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={10} fill="#333" />
        ))}
      </svg>
    </div>
  );
};

// ─── Main Game Component ───────────────────────────────
export const LudoGame = ({ onBack }: LudoGameProps) => {
  const { user } = useAuth();
  const gameLobby = useGameLobby();
  const { saveGameResult } = useGameStats();
  const { lobby, players, isHost, isMyTurn } = gameLobby;

  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [playerStates, setPlayerStates] = useState<Record<string, LudoPlayerState>>({});
  const [hasRolled, setHasRolled] = useState(false);
  const [message, setMessage] = useState("");
  const rollingRef = useRef(false);
  const playerStatesRef = useRef<Record<string, LudoPlayerState>>({});
  const winnerRef = useRef<string | null>(null);
  const diceValueRef = useRef<number | null>(null);
  const moveInProgressRef = useRef(false);

  const updateGameStateRef = useRef(gameLobby.updateGameState);
  const playersRef = useRef(players);
  const userRef = useRef(user);
  const lobbyRef = useRef(lobby);
  useEffect(() => { updateGameStateRef.current = gameLobby.updateGameState; }, [gameLobby.updateGameState]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { lobbyRef.current = lobby; }, [lobby]);

  useEffect(() => {
    if (lobby?.game_state) {
      if (lobby.game_state.playerStates) {
        setPlayerStates(lobby.game_state.playerStates);
        playerStatesRef.current = lobby.game_state.playerStates;
      }
      if (lobby.game_state.winner !== undefined) {
        setWinner(lobby.game_state.winner);
        winnerRef.current = lobby.game_state.winner;
      }
      if (lobby.game_state.lastDice) {
        setDiceValue(lobby.game_state.lastDice);
        diceValueRef.current = lobby.game_state.lastDice;
      }
      if (lobby.game_state.message !== undefined) setMessage(lobby.game_state.message);
      setHasRolled(lobby.game_state.hasRolled || false);
      moveInProgressRef.current = false;
    }
  }, [lobby?.game_state]);

  const handleCreateGame = async () => { await gameLobby.createLobby("ludo", 4); };

  const handleStartGame = async () => {
    const startOffsets = [0, 13, 26, 39];
    const initialStates: Record<string, LudoPlayerState> = {};
    players.forEach((p, i) => {
      initialStates[p.user_id] = {
        tokens: Array(4).fill(null).map(() => ({ position: 0, isFinished: false })),
        startOffset: startOffsets[i],
      };
    });
    await gameLobby.startGame({ playerStates: initialStates, winner: null, lastDice: null, message: "", hasRolled: false });
  };

  const canMoveToken = useCallback((token: LudoToken, dice: number): boolean => {
    if (token.isFinished) return false;
    if (token.position === 0) return dice === 6;
    const newPos = token.position + dice;
    if (newPos > BOARD_SIZE + HOME_STRETCH) return false;
    return true;
  }, []);

  const getNextPlayer = useCallback((): string => {
    const currentUser = userRef.current;
    const currentPlayers = playersRef.current;
    const idx = currentPlayers.findIndex((p) => p.user_id === currentUser?.id);
    return currentPlayers[(idx + 1) % currentPlayers.length].user_id;
  }, []);

  const rollDice = useCallback(() => {
    if (!isMyTurn || rollingRef.current || winnerRef.current || hasRolled || moveInProgressRef.current) return;
    rollingRef.current = true;
    moveInProgressRef.current = true;
    setRolling(true);

    const dice = Math.floor(Math.random() * 6) + 1;
    let count = 0;
    const interval = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count >= 8) {
        clearInterval(interval);
        setDiceValue(dice);
        diceValueRef.current = dice;
        setRolling(false);
        rollingRef.current = false;
        handleDiceResult(dice);
      }
    }, 100);
  }, [isMyTurn, hasRolled]);

  const handleDiceResult = async (dice: number) => {
    const currentUser = userRef.current;
    const currentLobby = lobbyRef.current;
    if (!currentUser || !currentLobby) { moveInProgressRef.current = false; return; }

    const myState = playerStatesRef.current[currentUser.id];
    if (!myState) { moveInProgressRef.current = false; return; }

    const canMove = myState.tokens.some((t) => canMoveToken(t, dice));

    if (!canMove) {
      const nextPlayer = getNextPlayer();
      await updateGameStateRef.current(
        { playerStates: playerStatesRef.current, winner: winnerRef.current, lastDice: dice, hasRolled: false, message: `No valid moves. Turn passed.` },
        nextPlayer
      );
      return;
    }

    setHasRolled(true);
    setMessage(`Rolled ${dice}! Tap a token to move.`);
    moveInProgressRef.current = false;
    await updateGameStateRef.current({
      playerStates: playerStatesRef.current,
      winner: winnerRef.current,
      lastDice: dice,
      hasRolled: true,
      message: `Rolled ${dice}! Choose a token.`,
    });
  };

  const handleTokenClick = async (tokenIndex: number) => {
    if (!isMyTurn || !hasRolled || !user || !lobby || !diceValue || moveInProgressRef.current) return;
    moveInProgressRef.current = true;

    const currentStates = playerStatesRef.current;
    const myState = currentStates[user.id];
    if (!myState) { moveInProgressRef.current = false; return; }

    const token = myState.tokens[tokenIndex];
    if (!canMoveToken(token, diceValue)) {
      toast.error("Can't move this token!");
      moveInProgressRef.current = false;
      return;
    }

    const newStates = JSON.parse(JSON.stringify(currentStates)) as Record<string, LudoPlayerState>;
    playerStatesRef.current = newStates;
    const newTokens = newStates[user.id].tokens;

    if (token.position === 0 && diceValue === 6) {
      newTokens[tokenIndex].position = 1;
    } else {
      const newPos = token.position + diceValue;
      if (newPos >= BOARD_SIZE + HOME_STRETCH) {
        newTokens[tokenIndex].position = BOARD_SIZE + HOME_STRETCH;
        newTokens[tokenIndex].isFinished = true;
      } else {
        newTokens[tokenIndex].position = newPos;
      }
    }

    // Check captures
    const myAbsPos = getAbsolutePosition(newTokens[tokenIndex].position, myState.startOffset);
    if (myAbsPos > 0 && myAbsPos <= BOARD_SIZE && !SAFE_SQUARES.includes(myAbsPos) && !newTokens[tokenIndex].isFinished) {
      Object.entries(newStates).forEach(([uid, state]) => {
        if (uid === user.id) return;
        state.tokens.forEach((t) => {
          if (!t.isFinished && t.position > 0 && t.position <= BOARD_SIZE) {
            const otherAbsPos = getAbsolutePosition(t.position, state.startOffset);
            if (otherAbsPos === myAbsPos) { t.position = 0; toast.success("Captured! 💥"); }
          }
        });
      });
    }

    const allFinished = newTokens.every((t) => t.isFinished);
    let nextPlayer: string | undefined;
    let msg = "";

    if (allFinished) {
      setWinner(user.id);
      winnerRef.current = user.id;
      msg = `🎉 ${players.find((p) => p.user_id === user.id)?.display_name} wins!`;
      saveGameResult({ gameType: "ludo", winnerId: user.id, playerIds: players.map((p) => p.user_id), result: "completed" });
      toast.success("You won! 🎉");
    } else if (diceValue === 6) {
      nextPlayer = user.id;
      msg = "Rolled 6 — extra turn!";
    } else {
      nextPlayer = getNextPlayer();
      msg = "";
    }

    await gameLobby.updateGameState(
      { playerStates: newStates, winner: allFinished ? user.id : null, lastDice: diceValue, hasRolled: false, message: msg },
      nextPlayer
    );
  };

  const currentTurnPlayer = players.find((p) => p.user_id === lobby?.current_turn_user_id);

  // Pre-lobby screens
  if (!lobby) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">🎲 Ludo</h2>
          <p className="text-sm text-muted-foreground">2-4 players • Classic Indian board game</p>
        </div>
        <div className="space-y-3">
          <Button onClick={handleCreateGame} className="w-full gradient-primary" disabled={gameLobby.isLoading}>Create Game</Button>
          <JoinInput onJoin={(code) => gameLobby.joinLobby(code)} isLoading={gameLobby.isLoading} />
          <Button variant="outline" onClick={onBack} className="w-full"><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
        </div>
      </div>
    );
  }

  if (lobby.status === "waiting") {
    return <GameLobbyComponent lobby={lobby} players={players} isHost={isHost} isLoading={gameLobby.isLoading} maxPlayers={4} gameName="🎲 Ludo" minPlayers={2} onReady={(r) => gameLobby.setReady(r)} onStart={handleStartGame} onLeave={gameLobby.leaveLobby} />;
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🎲 Ludo</h2>
        {winner ? (
          <Badge className="bg-yellow-500 text-black">
            <Trophy className="h-3 w-3 mr-1" />{players.find((p) => p.user_id === winner)?.display_name} wins!
          </Badge>
        ) : (
          <Badge variant={isMyTurn ? "default" : "secondary"} className={cn(isMyTurn && "animate-pulse")}>
            {isMyTurn ? "Your turn!" : `${currentTurnPlayer?.display_name}'s turn`}
          </Badge>
        )}
      </div>

      {/* Player indicators */}
      <div className="flex gap-2 justify-center flex-wrap">
        {players.map((p, idx) => (
          <div
            key={p.user_id}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all",
              lobby.current_turn_user_id === p.user_id && "ring-2 ring-offset-1 scale-105"
            )}
            style={{
              backgroundColor: PLAYER_COLORS.light[idx],
              color: PLAYER_COLORS.dark[idx],
              ...(lobby.current_turn_user_id === p.user_id ? { ringColor: PLAYER_COLORS.bg[idx] } : {}),
            }}
          >
            <span>{PLAYER_EMOJIS[idx]}</span>
            <span>{p.display_name.slice(0, 8)}</span>
          </div>
        ))}
      </div>

      {/* Visual Board */}
      <LudoBoard
        players={players}
        playerStates={playerStates}
        currentUserId={user?.id}
        isMyTurn={isMyTurn}
        hasRolled={hasRolled}
        diceValue={diceValue}
        canMoveToken={canMoveToken}
        onTokenClick={handleTokenClick}
        moveInProgress={moveInProgressRef.current}
      />

      {/* Message */}
      {message && (
        <div className="text-center text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">{message}</div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        {diceValue && <DiceFace value={diceValue} rolling={rolling} />}
        <div className="flex-1 space-y-2">
          {!winner && (
            <Button onClick={rollDice} disabled={!isMyTurn || rolling || hasRolled || moveInProgressRef.current} className="w-full gradient-primary h-12 text-base">
              <Dices className="h-5 w-5 mr-2" />
              {rolling ? "Rolling..." : hasRolled ? "Tap a token..." : isMyTurn ? "Roll Dice" : "Wait your turn"}
            </Button>
          )}
          {winner && <Button onClick={gameLobby.leaveLobby} className="w-full"><RotateCcw className="h-4 w-4 mr-2" /> Back to Menu</Button>}
          <Button variant="outline" onClick={gameLobby.leaveLobby} size="sm" className="w-full">Leave Game</Button>
        </div>
      </div>
    </div>
  );
};

const JoinInput = ({ onJoin, isLoading }: { onJoin: (code: string) => Promise<boolean>; isLoading: boolean }) => {
  const [code, setCode] = useState("");
  return (
    <div className="flex gap-2">
      <Input placeholder="Enter game code..." value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="flex-1 font-mono tracking-wider" maxLength={6} />
      <Button onClick={async () => { if (await onJoin(code)) setCode(""); }} disabled={!code.trim() || isLoading}>Join</Button>
    </div>
  );
};
