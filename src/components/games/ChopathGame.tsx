import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useGameLobby } from "@/hooks/useGameLobby";
import { useGameStats } from "@/hooks/useGameStats";
import { GameLobbyComponent } from "./GameLobby";
import { Dices, Trophy, ArrowLeft, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const BOARD_SIZE = 68;
const SAFE_CELLS = [0, 9, 17, 26, 34, 43, 51, 60];
const PLAYER_EMOJIS = ["🔴", "🟠", "🟢", "🔵"];
const PLAYER_BG = ["bg-red-500/15", "bg-orange-500/15", "bg-green-500/15", "bg-blue-500/15"];

interface ChopathPawn {
  position: number;
  isFinished: boolean;
}

interface ChopathProps {
  onBack: () => void;
}

export const ChopathGame = ({ onBack }: ChopathProps) => {
  const { user } = useAuth();
  const gameLobby = useGameLobby();
  const { saveGameResult } = useGameStats();
  const { lobby, players, isHost, isMyTurn } = gameLobby;

  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [pawnStates, setPawnStates] = useState<Record<string, ChopathPawn[]>>({});
  const [hasRolled, setHasRolled] = useState(false);
  const [message, setMessage] = useState("");
  const rollingRef = useRef(false);
  const pawnStatesRef = useRef<Record<string, ChopathPawn[]>>({});
  const winnerRef = useRef<string | null>(null);
  const diceValueRef = useRef<number | null>(null);

  // Stable refs to avoid stale closures in setInterval
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
      if (lobby.game_state.pawnStates) {
        setPawnStates(lobby.game_state.pawnStates);
        pawnStatesRef.current = lobby.game_state.pawnStates;
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
    }
  }, [lobby?.game_state]);

  const throwCowries = (): number => {
    const shells = Array.from({ length: 6 }, () => Math.random() > 0.5);
    const faceUp = shells.filter(Boolean).length;
    return faceUp === 0 ? 6 : faceUp;
  };

  const handleCreateGame = async () => {
    await gameLobby.createLobby("chopat", 4);
  };

  const handleStartGame = async () => {
    const initial: Record<string, ChopathPawn[]> = {};
    players.forEach((p) => {
      initial[p.user_id] = Array(4).fill(null).map(() => ({ position: 0, isFinished: false }));
    });

    await gameLobby.startGame({
      pawnStates: initial,
      winner: null,
      lastDice: null,
      message: "Throw the cowrie shells! 🐚",
      hasRolled: false,
    });
  };

  const canMovePawn = (pawn: ChopathPawn, dice: number) => {
    if (pawn.isFinished) return false;
    if (pawn.position === 0) return dice === 6 || dice === 1;
    const newPos = pawn.position + dice;
    if (newPos > BOARD_SIZE + 1) return false;
    return true;
  };

  const getNextPlayer = useCallback((): string => {
    const currentUser = userRef.current;
    const currentPlayers = playersRef.current;
    const idx = currentPlayers.findIndex((p) => p.user_id === currentUser?.id);
    return currentPlayers[(idx + 1) % currentPlayers.length].user_id;
  }, []);

  const rollDice = useCallback(() => {
    if (!isMyTurn || rollingRef.current || winnerRef.current || hasRolled) return;
    rollingRef.current = true;
    setRolling(true);

    const dice = throwCowries();
    let count = 0;
    const interval = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count >= 10) {
        clearInterval(interval);
        setDiceValue(dice);
        diceValueRef.current = dice;
        setRolling(false);
        rollingRef.current = false;

        // Use refs to get fresh state
        const currentUser = userRef.current;
        const myPawns = pawnStatesRef.current[currentUser!.id];
        const canMoveAny = myPawns?.some(
          (p) => !p.isFinished && (p.position > 0 || dice === 6 || dice === 1)
        );

        if (!canMoveAny) {
          const nextPlayer = getNextPlayer();
          updateGameStateRef.current(
            {
              pawnStates: pawnStatesRef.current,
              winner: winnerRef.current,
              lastDice: dice,
              hasRolled: false,
              message: `Threw ${dice} 🐚 — no valid moves!`,
            },
            nextPlayer
          );
          return;
        }

        updateGameStateRef.current({
          pawnStates: pawnStatesRef.current,
          winner: winnerRef.current,
          lastDice: dice,
          hasRolled: true,
          message: `Threw ${dice} 🐚 — choose a pawn!`,
        });
      }
    }, 100);
  }, [isMyTurn, hasRolled, getNextPlayer]);

  const handlePawnClick = async (pawnIdx: number) => {
    if (!isMyTurn || !hasRolled || !user || !lobby || !diceValue) return;

    const currentStates = pawnStatesRef.current;
    const myPawns = currentStates[user.id];
    if (!myPawns || !canMovePawn(myPawns[pawnIdx], diceValue)) {
      toast.error("Can't move this pawn!");
      return;
    }

    const newStates = JSON.parse(JSON.stringify(currentStates)) as Record<string, ChopathPawn[]>;
    pawnStatesRef.current = newStates;
    const pawn = newStates[user.id][pawnIdx];

    if (pawn.position === 0) {
      pawn.position = 1;
    } else {
      pawn.position += diceValue;
      if (pawn.position >= BOARD_SIZE + 1) {
        pawn.position = BOARD_SIZE + 1;
        pawn.isFinished = true;
      }
    }

    const allFinished = newStates[user.id].every((p) => p.isFinished);
    let nextPlayer: string | undefined;
    let msg = "";

    if (allFinished) {
      setWinner(user.id);
      winnerRef.current = user.id;
      msg = `🏆 ${players.find((p) => p.user_id === user.id)?.display_name} wins!`;
      await gameLobby.endGame(user.id);
      saveGameResult({
        gameType: "chopat",
        winnerId: user.id,
        playerIds: players.map((p) => p.user_id),
        result: "completed",
      });
      toast.success("You won Chopat! 🏆");
    } else if (diceValue === 6 || diceValue === 1) {
      nextPlayer = user.id;
      msg = "Bonus turn! 🐚";
    } else {
      nextPlayer = getNextPlayer();
    }

    await gameLobby.updateGameState(
      {
        pawnStates: newStates,
        winner: allFinished ? user.id : null,
        lastDice: diceValue,
        hasRolled: false,
        message: msg,
      },
      nextPlayer
    );
  };

  const currentTurnPlayer = players.find((p) => p.user_id === lobby?.current_turn_user_id);

  if (!lobby) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">🐚 Chopat (Chaupar)</h2>
          <p className="text-sm text-muted-foreground">2-4 players • Ancient Indian race game</p>
          <p className="text-xs text-muted-foreground mt-1">Throw cowrie shells, race your pawns home!</p>
        </div>
        <div className="space-y-3">
          <Button onClick={handleCreateGame} className="w-full gradient-gold" disabled={gameLobby.isLoading}>
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
        gameName="🐚 Chopat (Chaupar)"
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
        <h2 className="text-lg font-bold">🐚 Chopat</h2>
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
          const pawns = pawnStates[p.user_id] || [];
          const isCurrentTurn = lobby.current_turn_user_id === p.user_id;
          return (
            <div key={p.user_id} className={cn("rounded-xl p-3 border", PLAYER_BG[idx], isCurrentTurn && "ring-2 ring-primary")}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{PLAYER_EMOJIS[idx]}</span>
                <span className="text-xs font-semibold truncate">{p.display_name}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {pawns.filter((pw) => pw.isFinished).length}/4 home
                </span>
              </div>
              <div className="flex gap-1">
                {pawns.map((pawn, pi) => (
                  <button
                    key={pi}
                    onClick={() => handlePawnClick(pi)}
                    disabled={!isMyTurn || !hasRolled || p.user_id !== user?.id || !diceValue || !canMovePawn(pawn, diceValue)}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                      pawn.isFinished
                        ? "bg-yellow-500/30 border-yellow-500"
                        : pawn.position === 0
                        ? "bg-muted border-muted-foreground/30"
                        : cn(PLAYER_BG[idx], "border-current"),
                      isMyTurn && hasRolled && p.user_id === user?.id && diceValue && canMovePawn(pawn, diceValue) &&
                        "animate-pulse cursor-pointer ring-2 ring-primary"
                    )}
                  >
                    {pawn.isFinished ? "✓" : pawn.position === 0 ? "🏠" : pawn.position}
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
        {diceValue && <div className="text-4xl">🐚 {diceValue}</div>}
        <div className="flex-1 space-y-2">
          {!winner && (
            <Button onClick={rollDice} disabled={!isMyTurn || rolling || hasRolled} className="w-full gradient-gold">
              🐚 {rolling ? "Throwing..." : hasRolled ? "Choose a pawn..." : isMyTurn ? "Throw Cowries" : "Wait your turn"}
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
