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

// Traditional Indian Ludo: Red (top-left), Green (top-right), Yellow (bottom-right), Blue (bottom-left)
const PLAYER_EMOJIS = ["🔴", "🟢", "🟡", "🔵"];
const PLAYER_NAMES = ["Red", "Green", "Yellow", "Blue"];
const PLAYER_BG = [
  "bg-red-500", "bg-green-500", "bg-yellow-500", "bg-blue-500"
];
const PLAYER_BG_LIGHT = [
  "bg-red-100", "bg-green-100", "bg-yellow-100", "bg-blue-100"
];
const PLAYER_BG_MED = [
  "bg-red-300", "bg-green-300", "bg-yellow-300", "bg-blue-300"
];
const PLAYER_RING = [
  "ring-red-500", "ring-green-500", "ring-yellow-500", "ring-blue-500"
];
const PLAYER_TEXT = [
  "text-red-600", "text-green-600", "text-yellow-600", "text-blue-600"
];

const BOARD_SIZE = 52;
const HOME_STRETCH = 6;
const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

// 52 path positions mapped to [row, col] on a 15x15 grid (clockwise from Red's entry)
const PATH_GRID: [number, number][] = [
  [6,1],[6,2],[6,3],[6,4],[6,5],               // 1-5
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],          // 6-11
  [0,7],[0,8],                                   // 12-13
  [1,8],[2,8],[3,8],[4,8],[5,8],                // 14-18
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],     // 19-24
  [7,14],[8,14],                                 // 25-26
  [8,13],[8,12],[8,11],[8,10],[8,9],            // 27-31
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],     // 32-37
  [14,7],[14,6],                                 // 38-39
  [13,6],[12,6],[11,6],[10,6],[9,6],            // 40-44
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],          // 45-50
  [7,0],[6,0],                                   // 51-52
];

// Home stretch positions (game positions 53-58)
const HOME_STRETCH_GRID: [number, number][][] = [
  [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],       // Red
  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],       // Green
  [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],   // Yellow
  [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],   // Blue
];

// Token positions within home bases (4 tokens each)
const HOME_TOKEN_POS: [number, number][][] = [
  [[2,2],[2,3],[3,2],[3,3]],                    // Red (top-left)
  [[2,11],[2,12],[3,11],[3,12]],                // Green (top-right)
  [[11,11],[11,12],[12,11],[12,12]],            // Yellow (bottom-right)
  [[11,2],[11,3],[12,2],[12,3]],                // Blue (bottom-left)
];

// Star/safe positions and start positions for visual markers
const STAR_POSITIONS = new Set(SAFE_SQUARES.filter(s => s > 0));
const START_ABS = [1, 14, 27, 40]; // Where each player enters the board

interface LudoToken { position: number; isFinished: boolean; }
interface LudoPlayerState { tokens: LudoToken[]; startOffset: number; }
interface LudoGameProps { onBack: () => void; }

// Precompute a lookup: [row][col] → { pathIdx, isPath, isSafe, isStart, playerStart, stretchPlayer, stretchIdx }
interface CellInfo {
  type: 'empty' | 'path' | 'home' | 'stretch' | 'center';
  absPos?: number;       // For path cells: 1-52
  playerIdx?: number;    // For home/stretch: 0-3
  stretchIdx?: number;   // For stretch: 0-5
  homeTokenIdx?: number; // For home token slots
  isSafe?: boolean;
  isStart?: number;      // Player index whose start this is
}

const buildCellLookup = (): CellInfo[][] => {
  const grid: CellInfo[][] = Array.from({ length: 15 }, () =>
    Array.from({ length: 15 }, () => ({ type: 'empty' as const }))
  );

  // Home bases
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++)
    grid[r][c] = { type: 'home', playerIdx: 0 };
  for (let r = 0; r < 6; r++) for (let c = 9; c < 15; c++)
    grid[r][c] = { type: 'home', playerIdx: 1 };
  for (let r = 9; r < 15; r++) for (let c = 9; c < 15; c++)
    grid[r][c] = { type: 'home', playerIdx: 2 };
  for (let r = 9; r < 15; r++) for (let c = 0; c < 6; c++)
    grid[r][c] = { type: 'home', playerIdx: 3 };

  // Home token slots
  HOME_TOKEN_POS.forEach((positions, pIdx) => {
    positions.forEach(([r, c], tIdx) => {
      grid[r][c] = { type: 'home', playerIdx: pIdx, homeTokenIdx: tIdx };
    });
  });

  // Path cells
  PATH_GRID.forEach(([r, c], i) => {
    const absPos = i + 1;
    const startPlayerIdx = START_ABS.indexOf(absPos);
    grid[r][c] = {
      type: 'path',
      absPos,
      isSafe: STAR_POSITIONS.has(absPos),
      isStart: startPlayerIdx >= 0 ? startPlayerIdx : undefined,
    };
  });

  // Home stretches
  HOME_STRETCH_GRID.forEach((positions, pIdx) => {
    positions.forEach(([r, c], sIdx) => {
      grid[r][c] = { type: 'stretch', playerIdx: pIdx, stretchIdx: sIdx };
    });
  });

  // Center 3x3
  for (let r = 6; r <= 8; r++) for (let c = 6; c <= 8; c++)
    grid[r][c] = { type: 'center' };

  return grid;
};

const CELL_LOOKUP = buildCellLookup();

const getAbsolutePosition = (relPos: number, startOffset: number): number => {
  if (relPos === 0 || relPos > BOARD_SIZE) return -1;
  return ((relPos - 1 + startOffset) % BOARD_SIZE) + 1;
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

  // Build token position map: key = "row-col", value = array of { playerIdx, tokenIdx }
  const tokenMap = useMemo(() => {
    const map = new Map<string, { playerIdx: number; tokenIdx: number }[]>();
    const addToken = (r: number, c: number, pIdx: number, tIdx: number) => {
      const key = `${r}-${c}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ playerIdx: pIdx, tokenIdx: tIdx });
    };

    players.forEach((p, pIdx) => {
      const state = playerStates[p.user_id];
      if (!state) return;
      state.tokens.forEach((token, tIdx) => {
        if (token.isFinished) {
          addToken(7, 7, pIdx, tIdx); // Center
        } else if (token.position === 0) {
          const [r, c] = HOME_TOKEN_POS[pIdx][tIdx];
          addToken(r, c, pIdx, tIdx);
        } else if (token.position > BOARD_SIZE) {
          const stretchIdx = token.position - BOARD_SIZE - 1;
          const pos = HOME_STRETCH_GRID[pIdx][stretchIdx];
          if (pos) addToken(pos[0], pos[1], pIdx, tIdx);
        } else {
          const abs = getAbsolutePosition(token.position, state.startOffset);
          if (abs >= 1 && abs <= 52) {
            const [r, c] = PATH_GRID[abs - 1];
            addToken(r, c, pIdx, tIdx);
          }
        }
      });
    });
    return map;
  }, [players, playerStates]);

  const myPlayerIdx = players.findIndex(p => p.user_id === currentUserId);
  const myState = currentUserId ? playerStates[currentUserId] : undefined;

  const renderCell = (row: number, col: number) => {
    const info = CELL_LOOKUP[row][col];
    const tokens = tokenMap.get(`${row}-${col}`) || [];
    const key = `${row}-${col}`;

    // Background color
    let bg = "bg-card";
    let border = "border-border/30";
    let extra = "";

    if (info.type === 'home') {
      bg = PLAYER_BG_LIGHT[info.playerIdx!];
      if (info.homeTokenIdx !== undefined) {
        bg = "bg-white";
        border = "border-border";
      }
    } else if (info.type === 'path') {
      bg = "bg-white";
      if (info.isStart !== undefined) {
        bg = PLAYER_BG_MED[info.isStart];
      }
      if (info.isSafe) extra = "★";
    } else if (info.type === 'stretch') {
      bg = PLAYER_BG_LIGHT[info.playerIdx!];
    } else if (info.type === 'center') {
      // Triangular center - use gradient per position
      if (row === 7 && col === 7) bg = "bg-gradient-to-br from-red-400 via-green-400 to-yellow-400";
      else if (row === 6 && col === 7) bg = "bg-green-300";
      else if (row === 8 && col === 7) bg = "bg-blue-300";
      else if (row === 7 && col === 6) bg = "bg-red-300";
      else if (row === 7 && col === 8) bg = "bg-yellow-300";
      else if (row === 6 && col === 6) bg = "bg-red-200";
      else if (row === 6 && col === 8) bg = "bg-green-200";
      else if (row === 8 && col === 6) bg = "bg-blue-200";
      else if (row === 8 && col === 8) bg = "bg-yellow-200";
    } else {
      bg = "bg-muted/20";
    }

    return (
      <div
        key={key}
        className={cn(
          "relative flex items-center justify-center border",
          bg, border,
          info.type === 'empty' && "border-transparent"
        )}
        style={{ aspectRatio: '1' }}
      >
        {/* Star marker */}
        {extra === "★" && tokens.length === 0 && (
          <span className="text-[7px] text-yellow-500 font-bold">★</span>
        )}

        {/* Tokens */}
        {tokens.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            {tokens.length === 1 ? (
              <TokenCircle
                playerIdx={tokens[0].playerIdx}
                tokenIdx={tokens[0].tokenIdx}
                isClickable={
                  isMyTurn && hasRolled && !moveInProgress &&
                  tokens[0].playerIdx === myPlayerIdx &&
                  !!diceValue && !!myState &&
                  canMoveToken(myState.tokens[tokens[0].tokenIdx], diceValue)
                }
                onClick={() => {
                  if (tokens[0].playerIdx === myPlayerIdx) onTokenClick(tokens[0].tokenIdx);
                }}
                size="full"
              />
            ) : (
              <div className="grid grid-cols-2 gap-px w-full h-full p-px">
                {tokens.map((t, i) => (
                  <TokenCircle
                    key={i}
                    playerIdx={t.playerIdx}
                    tokenIdx={t.tokenIdx}
                    isClickable={
                      isMyTurn && hasRolled && !moveInProgress &&
                      t.playerIdx === myPlayerIdx &&
                      !!diceValue && !!myState &&
                      canMoveToken(myState.tokens[t.tokenIdx], diceValue)
                    }
                    onClick={() => {
                      if (t.playerIdx === myPlayerIdx) onTokenClick(t.tokenIdx);
                    }}
                    size="half"
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-[340px] mx-auto rounded-xl overflow-hidden border-2 border-border shadow-lg bg-card">
      <div
        className="w-full"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)' }}
      >
        {Array.from({ length: 225 }, (_, i) => renderCell(Math.floor(i / 15), i % 15))}
      </div>
    </div>
  );
};

// Token circle component
const TokenCircle = ({
  playerIdx, tokenIdx, isClickable, onClick, size,
}: {
  playerIdx: number; tokenIdx: number; isClickable: boolean;
  onClick: () => void; size: 'full' | 'half';
}) => {
  const sizeClass = size === 'full' ? 'w-[80%] h-[80%]' : 'w-full h-full';
  return (
    <button
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      className={cn(
        "rounded-full flex items-center justify-center font-bold shadow-sm transition-all",
        sizeClass,
        PLAYER_BG[playerIdx],
        "text-white text-[8px] border border-white/50",
        isClickable && "animate-pulse ring-2 ring-primary cursor-pointer scale-110",
        !isClickable && "cursor-default"
      )}
    >
      {tokenIdx + 1}
    </button>
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

  const canMoveToken = (token: LudoToken, dice: number): boolean => {
    if (token.isFinished) return false;
    if (token.position === 0) return dice === 6;
    const newPos = token.position + dice;
    if (newPos > BOARD_SIZE + HOME_STRETCH) return false;
    return true;
  };

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

  const getDiceEmoji = (v: number) => ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][v - 1];
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
      <div className="flex gap-2 justify-center">
        {players.map((p, idx) => (
          <div
            key={p.user_id}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all",
              PLAYER_BG_LIGHT[idx],
              lobby.current_turn_user_id === p.user_id && "ring-2 " + PLAYER_RING[idx],
            )}
          >
            <span>{PLAYER_EMOJIS[idx]}</span>
            <span className={PLAYER_TEXT[idx]}>{p.display_name.slice(0, 8)}</span>
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
        {diceValue && <div className="text-5xl animate-bounce-in">{getDiceEmoji(diceValue)}</div>}
        <div className="flex-1 space-y-2">
          {!winner && (
            <Button onClick={rollDice} disabled={!isMyTurn || rolling || hasRolled || moveInProgressRef.current} className="w-full gradient-primary">
              <Dices className="h-4 w-4 mr-2" />
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
