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

const PLAYER_COLORS = ["text-primary", "text-secondary", "text-green-500", "text-purple-500", "text-orange-500", "text-pink-500"];
const PLAYER_BG = ["bg-primary/20", "bg-secondary/20", "bg-green-500/20", "bg-purple-500/20", "bg-orange-500/20", "bg-pink-500/20"];

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

  useEffect(() => {
    if (lobby?.game_state?.positions) setPositions(lobby.game_state.positions);
    if (lobby?.game_state?.winner !== undefined) setWinner(lobby.game_state.winner);
    if (lobby?.game_state?.lastDice) setDiceValue(lobby.game_state.lastDice);
    if (lobby?.game_state?.message !== undefined) setMessage(lobby.game_state.message);
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

  const rollDice = useCallback(async () => {
    if (!isMyTurn || rollingRef.current || winner) return;
    rollingRef.current = true;
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
        movePlayer(dice);
      }
    }, 100);
  }, [isMyTurn, winner, positions, players, user, lobby]);

  const movePlayer = async (dice: number) => {
    if (!user || !lobby) return;
    const currentPos = positions[user.id] || 0;
    let newPos = currentPos + dice;
    let msg = `Rolled ${dice}`;

    if (newPos > 100) {
      msg = `Rolled ${dice} — need exact number to win!`;
      // Pass turn even when can't move
      const currentIdx = players.findIndex((p) => p.user_id === user.id);
      const nextIdx = (currentIdx + 1) % players.length;
      await updateState(positions, null, msg, dice, players[nextIdx].user_id);
      return;
    }

    if (newPos === 100) {
      const newPositions = { ...positions, [user.id]: 100 };
      await updateState(newPositions, user.id, `🎉 Winner!`, dice);
      saveGameResult({
        gameType: "snakes_and_ladders",
        winnerId: user.id,
        playerIds: players.map((p) => p.user_id),
        result: "completed",
        score: { final_position: 100 },
      });
      toast.success("You won! 🎉🐍");
      return;
    }

    if (SNAKES[newPos]) {
      msg = `Rolled ${dice} → 🐍 snake at ${newPos}, slid to ${SNAKES[newPos]}!`;
      newPos = SNAKES[newPos];
    } else if (LADDERS[newPos]) {
      msg = `Rolled ${dice} → 🪜 ladder at ${newPos}, climbed to ${LADDERS[newPos]}!`;
      newPos = LADDERS[newPos];
    }

    const newPositions = { ...positions, [user.id]: newPos };
    const currentIdx = players.findIndex((p) => p.user_id === user.id);
    const nextIdx = (currentIdx + 1) % players.length;
    await updateState(newPositions, null, msg, dice, players[nextIdx].user_id);
  };

  const updateState = async (
    newPositions: Record<string, number>,
    winnerId: string | null,
    msg: string,
    dice: number,
    nextTurnUserId?: string
  ) => {
    await gameLobby.updateGameState(
      { positions: newPositions, winner: winnerId, lastDice: dice, message: msg },
      nextTurnUserId
    );
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
          <Button onClick={handleCreateGame} className="w-full gradient-primary" disabled={gameLobby.isLoading}>
            Create Game
          </Button>
          <JoinInput onJoin={(code) => gameLobby.joinLobby(code)} isLoading={gameLobby.isLoading} />
          <Button variant="outline" onClick={onBack} className="w-full">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </div>
      </div>
    );
  }

  if (lobby.status === "waiting") {
    return (
      <GameLobbyComponent
        lobby={lobby}
        players={players}
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🐍 Snakes & Ladders</h2>
        {winner ? (
          <Badge className="bg-yellow-500 text-black">
            <Trophy className="h-3 w-3 mr-1" />
            {players.find((p) => p.user_id === winner)?.display_name} wins!
          </Badge>
        ) : (
          <Badge variant={isMyTurn ? "default" : "secondary"} className={cn(isMyTurn && "animate-pulse")}>
            {isMyTurn ? "Your turn!" : `${currentTurnPlayer?.display_name}'s turn`}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-10 gap-[1px] bg-border rounded-lg overflow-hidden text-[9px]">
        {Array.from({ length: 10 }).map((_, row) =>
          Array.from({ length: 10 }).map((_, col) => {
            const cellNum = getCellNumber(row, col);
            const isSnakeHead = SNAKES[cellNum] !== undefined;
            const isLadderBottom = LADDERS[cellNum] !== undefined;
            const playersHere = getPlayersAtCell(cellNum);

            return (
              <div
                key={cellNum}
                className={cn(
                  "aspect-square flex flex-col items-center justify-center relative",
                  isSnakeHead && "bg-red-500/15",
                  isLadderBottom && "bg-green-500/15",
                  !isSnakeHead && !isLadderBottom && (cellNum % 2 === 0 ? "bg-muted/50" : "bg-card"),
                  cellNum === 100 && "bg-yellow-500/20"
                )}
              >
                <span className="font-mono opacity-50 leading-none">{cellNum}</span>
                {isSnakeHead && <span className="text-[8px] leading-none">🐍</span>}
                {isLadderBottom && <span className="text-[8px] leading-none">🪜</span>}
                {playersHere.length > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex -space-x-1">
                      {playersHere.map((p) => (
                        <span key={p.user_id} className={cn("text-[10px]", PLAYER_COLORS[players.indexOf(p)])} title={p.display_name}>
                          <ProfileAvatar avatar={p.avatar} size="xs" />
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {players.map((p, i) => (
          <Badge
            key={p.user_id}
            variant="outline"
            className={cn("text-xs", PLAYER_BG[i], lobby.current_turn_user_id === p.user_id && "ring-2 ring-primary")}
          >
            <ProfileAvatar avatar={p.avatar} size="xs" /> {p.display_name}: {positions[p.user_id] || 0}
          </Badge>
        ))}
      </div>

      {message && (
        <div className="text-center text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          {message}
        </div>
      )}

      <div className="flex items-center gap-3">
        {diceValue && <div className="text-5xl animate-bounce-in">{getDiceEmoji(diceValue)}</div>}
        <div className="flex-1 space-y-2">
          {!winner && (
            <Button onClick={rollDice} disabled={!isMyTurn || rolling} className="w-full gradient-primary">
              <Dices className="h-4 w-4 mr-2" />
              {rolling ? "Rolling..." : isMyTurn ? "Roll Dice" : "Wait for your turn"}
            </Button>
          )}
          {winner && (
            <Button onClick={gameLobby.leaveLobby} className="w-full">
              <RotateCcw className="h-4 w-4 mr-2" /> Play Again
            </Button>
          )}
          <Button variant="outline" onClick={gameLobby.leaveLobby} size="sm" className="w-full">
            Leave Game
          </Button>
        </div>
      </div>
    </div>
  );
};

const JoinInput = ({ onJoin, isLoading }: { onJoin: (code: string) => Promise<boolean>; isLoading: boolean }) => {
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
