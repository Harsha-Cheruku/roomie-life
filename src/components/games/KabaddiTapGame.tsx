import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { useGameLobby } from "@/hooks/useGameLobby";
import { useGameStats } from "@/hooks/useGameStats";
import { GameLobbyComponent } from "./GameLobby";
import { Trophy, ArrowLeft, RotateCcw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";

interface KabaddiProps {
  onBack: () => void;
}

export const KabaddiTapGame = ({ onBack }: KabaddiProps) => {
  const { user } = useAuth();
  const gameLobby = useGameLobby();
  const { saveGameResult } = useGameStats();
  const { lobby, players, isHost, isMyTurn } = gameLobby;

  const [taps, setTaps] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [isRaiding, setIsRaiding] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [currentRaider, setCurrentRaider] = useState(0);
  const [gameFinished, setGameFinished] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const tapsRef = useRef(0);

  useEffect(() => {
    if (lobby?.game_state) {
      if (lobby.game_state.scores) setScores(lobby.game_state.scores);
      if (lobby.game_state.currentRaider !== undefined) setCurrentRaider(lobby.game_state.currentRaider);
      if (lobby.game_state.gameFinished) setGameFinished(lobby.game_state.gameFinished);
    }
  }, [lobby?.game_state]);

  const handleCreateGame = async () => {
    await gameLobby.createLobby("kabaddi_tap", 6);
  };

  const handleStartGame = async () => {
    await gameLobby.startGame({
      scores: {},
      currentRaider: 0,
      gameFinished: false,
    });
  };

  const startRaid = () => {
    if (!isMyTurn || isRaiding) return;
    setTaps(0);
    tapsRef.current = 0;
    setTimeLeft(15);
    setIsRaiding(true);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, 15 - elapsed);
      setTimeLeft(Math.ceil(remaining));

      if (remaining <= 0) {
        clearInterval(timerRef.current);
        setIsRaiding(false);
        finishRaid();
      }
    }, 100);
  };

  const handleTap = () => {
    if (!isRaiding) return;
    tapsRef.current += 1;
    setTaps(tapsRef.current);
  };

  const finishRaid = async () => {
    if (!user || !lobby) return;

    const currentTaps = tapsRef.current;
    const newScores = { ...scores, [user.id]: currentTaps };
    const nextRaider = currentRaider + 1;
    const isLastRaider = nextRaider >= players.length;

    if (isLastRaider) {
      const winnerId = Object.entries(newScores).sort(([, a], [, b]) => b - a)[0]?.[0];
      
      saveGameResult({
        gameType: "kabaddi_tap",
        winnerId,
        playerIds: players.map((p) => p.user_id),
        result: "completed",
        score: newScores as Record<string, unknown>,
      });

      await gameLobby.updateGameState({
        scores: newScores,
        currentRaider: nextRaider,
        gameFinished: true,
      });
    } else {
      await gameLobby.updateGameState(
        {
          scores: newScores,
          currentRaider: nextRaider,
          gameFinished: false,
        },
        players[nextRaider].user_id
      );
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const currentTurnPlayer = players.find((p) => p.user_id === lobby?.current_turn_user_id);
  const sortedScores = Object.entries(scores)
    .map(([uid, score]) => ({
      player: players.find((p) => p.user_id === uid),
      score,
    }))
    .sort((a, b) => b.score - a.score);

  if (!lobby) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">🤼 Kabaddi Tap</h2>
          <p className="text-sm text-muted-foreground">2-6 players • Tap as fast as you can!</p>
          <p className="text-xs text-muted-foreground mt-1">Inspired by the ancient Indian sport</p>
        </div>
        <div className="space-y-3">
          <Button onClick={handleCreateGame} className="w-full gradient-coral" disabled={gameLobby.isLoading}>
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
        gameName="🤼 Kabaddi Tap"
        minPlayers={2}
        onReady={(r) => gameLobby.setReady(r)}
        onStart={handleStartGame}
        onLeave={gameLobby.leaveLobby}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-bold">🤼 Kabaddi Tap</h2>
        <p className="text-xs text-muted-foreground">
          Raider {Math.min(currentRaider + 1, players.length)}/{players.length}
        </p>
      </div>

      {isMyTurn && !gameFinished && (
        <div className="space-y-3">
          {!isRaiding ? (
            <Button onClick={startRaid} className="w-full h-32 text-xl gradient-coral">
              <Zap className="h-6 w-6 mr-2" />
              Start Raid!
            </Button>
          ) : (
            <>
              <div className="text-center">
                <Badge variant="secondary" className="text-lg px-4 py-1">
                  ⏱️ {timeLeft}s
                </Badge>
              </div>
              <Progress value={(timeLeft / 15) * 100} className="h-2" />
              <button
                onClick={handleTap}
                className="w-full h-40 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 text-white text-center flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform select-none"
              >
                <span className="text-5xl font-bold">{taps}</span>
                <span className="text-lg font-semibold">TAP! TAP! TAP!</span>
                <span className="text-xs opacity-70">Kabaddi... Kabaddi... Kabaddi...</span>
              </button>
            </>
          )}
        </div>
      )}

      {!isMyTurn && !gameFinished && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            {currentTurnPlayer?.display_name} is raiding...
          </p>
          <p className="text-sm text-muted-foreground mt-1">Wait for your turn!</p>
        </div>
      )}

      {sortedScores.length > 0 && (
        <div className="space-y-2 bg-card rounded-xl p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            {gameFinished ? "Final Scores" : "Scores So Far"}
          </h3>
          {sortedScores.map((entry, i) => (
            <div key={entry.player?.user_id} className="flex items-center justify-between">
              <span className="text-sm flex items-center gap-2">
                {i === 0 && gameFinished && "🥇"}
                {i === 1 && gameFinished && "🥈"}
                {i === 2 && gameFinished && "🥉"}
                {entry.player?.avatar} {entry.player?.display_name}
              </span>
              <Badge variant={i === 0 ? "default" : "secondary"}>{entry.score} taps</Badge>
            </div>
          ))}
        </div>
      )}

      {gameFinished && (
        <Button onClick={gameLobby.leaveLobby} className="w-full">
          <RotateCcw className="h-4 w-4 mr-2" /> Back to Menu
        </Button>
      )}

      <Button variant="outline" onClick={gameLobby.leaveLobby} size="sm" className="w-full">
        Leave Game
      </Button>
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
