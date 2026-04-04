import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useGameLobby } from "@/hooks/useGameLobby";
import { useGameStats } from "@/hooks/useGameStats";
import { GameLobbyComponent } from "./GameLobby";
import { Input } from "@/components/ui/input";
import { Dices, Trophy, ArrowLeft, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";

const SNAKES: Record<number, number> = {
  16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78,
};
const LADDERS: Record<number, number> = {
  1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100,
};

const PLAYER_COLORS = ["#EF4444", "#3B82F6", "#22C55E", "#A855F7", "#F97316", "#EC4899"];
const PLAYER_NAMES_COLORS = ["text-red-500", "text-blue-500", "text-green-500", "text-purple-500", "text-orange-500", "text-pink-500"];

// Classic yellow/orange checkered board colors
const CELL_LIGHT = "bg-amber-200";
const CELL_DARK = "bg-amber-400";

interface SnakesAndLaddersProps {
  onBack: () => void;
}

export const SnakesAndLadders = ({ onBack }: SnakesAndLaddersProps) => {
  const { user } = useAuth();
  const gameLobby = useGameLobby();
  const { saveGameResult } = useGameStats();
  const { lobby, players, isHost, isMyTurn } = gameLobby;

  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");
  const rollingRef = useRef(false);
  const positionsRef = useRef<Record<string, number>>({});
  const winnerRef = useRef<string | null>(null);
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
    if (lobby?.game_state?.positions) {
      setPositions(lobby.game_state.positions);
      positionsRef.current = lobby.game_state.positions;
    }
    if (lobby?.game_state?.winner !== undefined) {
      setWinner(lobby.game_state.winner);
      winnerRef.current = lobby.game_state.winner;
    }
    if (lobby?.game_state?.lastDice) setDiceValue(lobby.game_state.lastDice);
    if (lobby?.game_state?.message !== undefined) setMessage(lobby.game_state.message);
    moveInProgressRef.current = false;
  }, [lobby?.game_state]);

  const handleCreateGame = async () => {
    await gameLobby.createLobby("snakes_and_ladders", 6);
  };

  const handleStartGame = async () => {
    const initialPositions: Record<string, number> = {};
    players.forEach((p) => (initialPositions[p.user_id] = 0));
    await gameLobby.startGame({
      positions: initialPositions,
      winner: null,
      lastDice: null,
      message: "",
    });
  };

  const rollDice = useCallback(() => {
    if (!isMyTurn || rollingRef.current || winnerRef.current || moveInProgressRef.current) return;
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
        setRolling(false);
        rollingRef.current = false;
        movePlayerWithRefs(dice);
      }
    }, 100);
  }, [isMyTurn]);

  const movePlayerWithRefs = async (dice: number) => {
    const currentUser = userRef.current;
    const currentLobby = lobbyRef.current;
    const currentPlayers = playersRef.current;
    if (!currentUser || !currentLobby) { moveInProgressRef.current = false; return; }

    const currentPositions = { ...positionsRef.current };
    const currentPos = currentPositions[currentUser.id] || 0;
    let newPos = currentPos + dice;
    let msg = `Rolled ${dice}`;

    if (newPos > 100) {
      msg = `Rolled ${dice} — need exact number to win!`;
      const currentIdx = currentPlayers.findIndex((p) => p.user_id === currentUser.id);
      const nextIdx = (currentIdx + 1) % currentPlayers.length;
      const success = await updateGameStateRef.current(
        { positions: currentPositions, winner: null, lastDice: dice, message: msg },
        currentPlayers[nextIdx].user_id
      );
      if (!success) moveInProgressRef.current = false;
      return;
    }

    if (newPos === 100) {
      const newPositions = { ...currentPositions, [currentUser.id]: 100 };
      await updateGameStateRef.current(
        { positions: newPositions, winner: currentUser.id, lastDice: dice, message: `🎉 Winner!` }
      );
      await gameLobby.endGame(currentUser.id);
      saveGameResult({
        gameType: "snakes_and_ladders",
        winnerId: currentUser.id,
        playerIds: currentPlayers.map((p) => p.user_id),
        result: "completed",
        score: { final_position: 100 },
      });
      toast.success("You won! 🎉🐍");
      return;
    }

    if (SNAKES[newPos]) {
      msg = `Rolled ${dice} → 🐍 Snake at ${newPos}! Slid to ${SNAKES[newPos]}`;
      newPos = SNAKES[newPos];
    } else if (LADDERS[newPos]) {
      msg = `Rolled ${dice} → 🪜 Ladder at ${newPos}! Climbed to ${LADDERS[newPos]}`;
      newPos = LADDERS[newPos];
    }

    const newPositions = { ...currentPositions, [currentUser.id]: newPos };
    const currentIdx = currentPlayers.findIndex((p) => p.user_id === currentUser.id);
    const nextIdx = (currentIdx + 1) % currentPlayers.length;
    const success = await updateGameStateRef.current(
      { positions: newPositions, winner: null, lastDice: dice, message: msg },
      currentPlayers[nextIdx].user_id
    );
    if (!success) moveInProgressRef.current = false;
  };

  const getCellNumber = (row: number, col: number) => {
    const r = 9 - row;
    return r % 2 === 0 ? r * 10 + col + 1 : r * 10 + (9 - col) + 1;
  };

  const getPlayersAtCell = (cellNum: number) => {
    return players.filter((p) => (positions[p.user_id] || 0) === cellNum);
  };

  const getDiceEmoji = (v: number) => ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][v - 1];
  const currentTurnPlayer = players.find((p) => p.user_id === lobby?.current_turn_user_id);

  if (!lobby) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">🐍 Snakes & Ladders</h2>
          <p className="text-sm text-muted-foreground">2-6 players • Classic board game</p>
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
    return (
      <GameLobbyComponent lobby={lobby} players={players} isHost={isHost} isLoading={gameLobby.isLoading} maxPlayers={6} gameName="🐍 Snakes & Ladders" minPlayers={2} onReady={(r) => gameLobby.setReady(r)} onStart={handleStartGame} onLeave={gameLobby.leaveLobby} />
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🐍 Snakes & Ladders</h2>
        {winner ? (
          <Badge className="bg-yellow-500 text-black"><Trophy className="h-3 w-3 mr-1" />{players.find((p) => p.user_id === winner)?.display_name} wins!</Badge>
        ) : (
          <Badge variant={isMyTurn ? "default" : "secondary"} className={cn(isMyTurn && "animate-pulse")}>
            {isMyTurn ? "Your turn!" : `${currentTurnPlayer?.display_name}'s turn`}
          </Badge>
        )}
      </div>

      {/* Classic Indian-style Board */}
      <div className="relative rounded-xl overflow-hidden border-4 border-amber-700 shadow-xl bg-amber-300">
        {/* Board header */}
        <div className="bg-amber-600 text-center py-1">
          <span className="text-white font-bold text-xs tracking-wider">SNAKES & LADDERS</span>
        </div>
        
        <div className="grid grid-cols-10 gap-0">
          {Array.from({ length: 10 }).map((_, row) =>
            Array.from({ length: 10 }).map((_, col) => {
              const cellNum = getCellNumber(row, col);
              const isSnakeHead = SNAKES[cellNum] !== undefined;
              const isSnakeTail = Object.values(SNAKES).includes(cellNum);
              const isLadderBottom = LADDERS[cellNum] !== undefined;
              const isLadderTop = Object.values(LADDERS).includes(cellNum);
              const playersHere = getPlayersAtCell(cellNum);
              const isEvenCell = (row + col) % 2 === 0;
              
              return (
                <div
                  key={cellNum}
                  className={cn(
                    "aspect-square flex flex-col items-center justify-center relative border border-amber-500/30",
                    isEvenCell ? CELL_LIGHT : CELL_DARK,
                    cellNum === 100 && "bg-yellow-300 ring-2 ring-yellow-500 ring-inset",
                    cellNum === 1 && "bg-green-300"
                  )}
                >
                  {/* Cell number */}
                  <span className={cn(
                    "font-bold leading-none z-10",
                    cellNum === 100 ? "text-[9px] text-yellow-700" : "text-[8px] text-amber-800/60"
                  )}>
                    {cellNum}
                  </span>
                  
                  {/* Snake/Ladder indicators */}
                  {isSnakeHead && (
                    <span className="text-[11px] leading-none z-10" title={`Snake → ${SNAKES[cellNum]}`}>🐍</span>
                  )}
                  {isSnakeTail && (
                    <span className="absolute bottom-0 right-0 text-[7px] opacity-50">🐍</span>
                  )}
                  {isLadderBottom && (
                    <span className="text-[11px] leading-none z-10" title={`Ladder → ${LADDERS[cellNum]}`}>🪜</span>
                  )}
                  {isLadderTop && (
                    <span className="absolute bottom-0 right-0 text-[7px] opacity-50">🪜</span>
                  )}
                  
                  {/* Star on cell 100 */}
                  {cellNum === 100 && <span className="text-[10px]">⭐</span>}
                  
                  {/* Player tokens */}
                  {playersHere.length > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center z-20">
                      <div className="flex flex-wrap justify-center gap-[1px]">
                        {playersHere.map((p) => {
                          const idx = players.indexOf(p);
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
        
        {/* Board footer */}
        <div className="bg-amber-600 text-center py-1">
          <span className="text-white/80 text-[8px]">🐍 Snakes take you down • 🪜 Ladders take you up</span>
        </div>
      </div>

      {/* Player scores */}
      <div className="flex flex-wrap gap-2">
        {players.map((p, i) => (
          <Badge
            key={p.user_id}
            variant="outline"
            className={cn(
              "text-xs gap-1 py-1",
              lobby.current_turn_user_id === p.user_id && "ring-2 ring-primary shadow-md"
            )}
          >
            <div
              className="w-3 h-3 rounded-full border border-white/50"
              style={{ backgroundColor: PLAYER_COLORS[i] || "#999" }}
            />
            <span className={PLAYER_NAMES_COLORS[i]}>{p.display_name}</span>: {positions[p.user_id] || 0}
          </Badge>
        ))}
      </div>

      {/* Message */}
      {message && <div className="text-center text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">{message}</div>}

      {/* Dice & Controls */}
      <div className="flex items-center gap-3">
        {diceValue && <div className="text-5xl animate-bounce-in">{getDiceEmoji(diceValue)}</div>}
        <div className="flex-1 space-y-2">
          {!winner && (
            <Button onClick={rollDice} disabled={!isMyTurn || rolling || moveInProgressRef.current} className="w-full gradient-primary">
              <Dices className="h-4 w-4 mr-2" />
              {rolling ? "Rolling..." : isMyTurn ? "Roll Dice" : "Wait for your turn"}
            </Button>
          )}
          {winner && <Button onClick={gameLobby.leaveLobby} className="w-full"><RotateCcw className="h-4 w-4 mr-2" /> Play Again</Button>}
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