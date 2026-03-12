import { useState, useEffect, useRef } from "react";
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

const LUDO_COLORS = ["🔴", "🔵", "🟢", "🟡"];
const LUDO_BG = ["bg-red-500/20", "bg-blue-500/20", "bg-green-500/20", "bg-yellow-500/20"];
const LUDO_TEXT = ["text-red-500", "text-blue-500", "text-green-500", "text-yellow-500"];

const BOARD_SIZE = 52;
const HOME_STRETCH = 6;
const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

interface LudoToken {
  position: number;
  isFinished: boolean;
}

interface LudoPlayerState {
  tokens: LudoToken[];
  startOffset: number;
}

interface LudoGameProps {
  onBack: () => void;
}

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

  useEffect(() => {
    if (lobby?.game_state) {
      if (lobby.game_state.playerStates) {
        setPlayerStates(lobby.game_state.playerStates);
        playerStatesRef.current = lobby.game_state.playerStates;
      }
      if (lobby.game_state.winner !== undefined) setWinner(lobby.game_state.winner);
      if (lobby.game_state.lastDice) setDiceValue(lobby.game_state.lastDice);
      if (lobby.game_state.message !== undefined) setMessage(lobby.game_state.message);
      setHasRolled(lobby.game_state.hasRolled || false);
    }
  }, [lobby?.game_state]);

  const handleCreateGame = async () => {
    await gameLobby.createLobby("ludo", 4);
  };

  const handleStartGame = async () => {
    const startOffsets = [0, 13, 26, 39];
    const initialStates: Record<string, LudoPlayerState> = {};
    players.forEach((p, i) => {
      initialStates[p.user_id] = {
        tokens: Array(4).fill(null).map(() => ({ position: 0, isFinished: false })),
        startOffset: startOffsets[i],
      };
    });

    await gameLobby.startGame({
      playerStates: initialStates,
      winner: null,
      lastDice: null,
      message: "",
      hasRolled: false,
    });
  };

  const rollDice = async () => {
    if (!isMyTurn || rollingRef.current || winner || hasRolled) return;
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
        handleDiceResult(dice);
      }
    }, 100);
  };

  const handleDiceResult = async (dice: number) => {
    if (!user || !lobby) return;
    const myState = playerStatesRef.current[user.id];
    if (!myState) return;

    const canMove = myState.tokens.some((t) => canMoveToken(t, dice));

    if (!canMove) {
      if (dice === 6 && myState.tokens.some((t) => t.position === 0 && !t.isFinished)) {
        setMessage(`Rolled 6! Click a token at home to bring it out.`);
        await gameLobby.updateGameState({
          ...lobby.game_state,
          lastDice: dice,
          hasRolled: true,
          message: `Rolled 6! Choose a token.`,
        });
        return;
      }

      // No valid moves — pass turn
      const nextPlayer = getNextPlayer();
      await gameLobby.updateGameState(
        { ...lobby.game_state, lastDice: dice, hasRolled: false, message: `No valid moves. Turn passed.` },
        nextPlayer
      );
      return;
    }

    setMessage(`Rolled ${dice}! Click a token to move.`);
    await gameLobby.updateGameState({
      ...lobby.game_state,
      lastDice: dice,
      hasRolled: true,
      message: `Rolled ${dice}! Choose a token.`,
    });
  };

  const canMoveToken = (token: LudoToken, dice: number): boolean => {
    if (token.isFinished) return false;
    if (token.position === 0) return dice === 6;
    const newPos = token.position + dice;
    if (newPos > BOARD_SIZE + HOME_STRETCH) return false;
    return true;
  };

  const handleTokenClick = async (tokenIndex: number) => {
    if (!isMyTurn || !hasRolled || !user || !lobby || !diceValue) return;

    const currentStates = playerStatesRef.current;
    const myState = currentStates[user.id];
    if (!myState) return;

    const token = myState.tokens[tokenIndex];
    if (!canMoveToken(token, diceValue)) {
      toast.error("Can't move this token!");
      return;
    }

    const newStates = JSON.parse(JSON.stringify(playerStates)) as Record<string, LudoPlayerState>;
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

    // Check for captures
    const myAbsPos = getAbsolutePosition(newTokens[tokenIndex].position, myState.startOffset);
    if (myAbsPos > 0 && myAbsPos <= BOARD_SIZE && !SAFE_SQUARES.includes(myAbsPos) && !newTokens[tokenIndex].isFinished) {
      Object.entries(newStates).forEach(([uid, state]) => {
        if (uid === user.id) return;
        state.tokens.forEach((t) => {
          if (!t.isFinished && t.position > 0 && t.position <= BOARD_SIZE) {
            const otherAbsPos = getAbsolutePosition(t.position, state.startOffset);
            if (otherAbsPos === myAbsPos) {
              t.position = 0;
              toast.success("Captured! 💥");
            }
          }
        });
      });
    }

    const allFinished = newTokens.every((t) => t.isFinished);
    let nextPlayer: string | undefined;
    let msg = "";

    if (allFinished) {
      setWinner(user.id);
      msg = `🎉 ${players.find((p) => p.user_id === user.id)?.display_name} wins!`;
      saveGameResult({
        gameType: "ludo",
        winnerId: user.id,
        playerIds: players.map((p) => p.user_id),
        result: "completed",
      });
      toast.success("You won! 🎉");
    } else if (diceValue === 6) {
      nextPlayer = user.id;
      msg = "Rolled 6 — extra turn!";
    } else {
      nextPlayer = getNextPlayer();
      msg = "";
    }

    await gameLobby.updateGameState(
      {
        playerStates: newStates,
        winner: allFinished ? user.id : null,
        lastDice: diceValue,
        hasRolled: false,
        message: msg,
      },
      nextPlayer
    );
  };

  const getAbsolutePosition = (relPos: number, startOffset: number): number => {
    if (relPos === 0 || relPos > BOARD_SIZE) return -1;
    return ((relPos - 1 + startOffset) % BOARD_SIZE) + 1;
  };

  const getNextPlayer = (): string => {
    const idx = players.findIndex((p) => p.user_id === user?.id);
    return players[(idx + 1) % players.length].user_id;
  };

  const getDiceEmoji = (v: number) => ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][v - 1];
  const currentTurnPlayer = players.find((p) => p.user_id === lobby?.current_turn_user_id);

  if (!lobby) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">🎲 Ludo</h2>
          <p className="text-sm text-muted-foreground">2-4 players • Classic Indian board game</p>
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
        maxPlayers={4}
        gameName="🎲 Ludo"
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
        <h2 className="text-lg font-bold">🎲 Ludo</h2>
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

      <div className="grid grid-cols-2 gap-2">
        {players.map((p, idx) => {
          const pState = playerStates[p.user_id];
          const isCurrentTurn = lobby.current_turn_user_id === p.user_id;
          return (
            <div key={p.user_id} className={cn("rounded-xl p-3 border", LUDO_BG[idx], isCurrentTurn && "ring-2 ring-primary")}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{LUDO_COLORS[idx]}</span>
                <span className="text-xs font-semibold truncate">{p.display_name}</span>
              </div>
              <div className="flex gap-1">
                {pState?.tokens.map((token, ti) => (
                  <button
                    key={ti}
                    onClick={() => handleTokenClick(ti)}
                    disabled={!isMyTurn || !hasRolled || p.user_id !== user?.id || !diceValue || !canMoveToken(token, diceValue)}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                      token.isFinished
                        ? "bg-yellow-500/30 border-yellow-500 text-yellow-700"
                        : token.position === 0
                        ? "bg-muted border-muted-foreground/30 text-muted-foreground"
                        : cn(LUDO_BG[idx], "border-current", LUDO_TEXT[idx]),
                      isMyTurn && hasRolled && p.user_id === user?.id && diceValue && canMoveToken(token, diceValue) &&
                        "animate-pulse cursor-pointer ring-2 ring-primary",
                      (!isMyTurn || !hasRolled || p.user_id !== user?.id) && "cursor-default"
                    )}
                  >
                    {token.isFinished ? "✓" : token.position === 0 ? "🏠" : token.position}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
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
            <Button onClick={rollDice} disabled={!isMyTurn || rolling || hasRolled} className="w-full gradient-primary">
              <Dices className="h-4 w-4 mr-2" />
              {rolling ? "Rolling..." : hasRolled ? "Choose a token..." : isMyTurn ? "Roll Dice" : "Wait your turn"}
            </Button>
          )}
          {winner && (
            <Button onClick={gameLobby.leaveLobby} className="w-full">
              <RotateCcw className="h-4 w-4 mr-2" /> Back to Menu
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
