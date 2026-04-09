import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Gamepad2, Dices, Target, Timer, Trophy, RotateCcw, Zap,
  Grid3X3, Users, Share2, BarChart3, ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useGameStats } from "@/hooks/useGameStats";
import { useGameLobby } from "@/hooks/useGameLobby";
import { GameStatsDashboard } from "@/components/games/GameStatsDashboard";
import { SnakesAndLadders } from "@/components/games/SnakesAndLadders";
import { LudoGame } from "@/components/games/LudoGame";
import { ChopathGame } from "@/components/games/ChopathGame";
import { KabaddiTapGame } from "@/components/games/KabaddiTapGame";

type GameType = 'menu' | 'tictactoe' | 'memory' | 'reaction' | 'dice' | 'stats' | 'snakes' | 'ludo' | 'chopat' | 'kabaddi';

interface MemoryCard {
  id: number;
  emoji: string;
  isFlipped: boolean;
  isMatched: boolean;
}

export default function Games() {
  const navigate = useNavigate();
  const { profile, user, isSoloMode } = useAuth();
  const { saveGameResult } = useGameStats();
  const gameLobby = useGameLobby();
  const [currentGame, setCurrentGame] = useState<GameType>('menu');
  
  // Global join code
  const [joinCodeInput, setJoinCodeInput] = useState("");
  
  // Tic Tac Toe state
  const [tttBoard, setTttBoard] = useState<(string | null)[]>(Array(9).fill(null));
  const [tttIsXNext, setTttIsXNext] = useState(true);
  const [tttWinner, setTttWinner] = useState<string | null>(null);
  
  // Memory Game state
  const [memoryCards, setMemoryCards] = useState<MemoryCard[]>([]);
  const [memoryFlipped, setMemoryFlipped] = useState<number[]>([]);
  const [memoryMoves, setMemoryMoves] = useState(0);
  const [memoryMatched, setMemoryMatched] = useState(0);
  
  // Reaction Time state
  const [reactionState, setReactionState] = useState<'waiting' | 'ready' | 'go' | 'clicked' | 'early'>('waiting');
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [reactionStartTime, setReactionStartTime] = useState<number>(0);
  const [reactionBestTime, setReactionBestTime] = useState<number | null>(null);
  
  // Dice state
  const [diceValues, setDiceValues] = useState<number[]>([1, 1]);
  const [diceRolling, setDiceRolling] = useState(false);
  const [diceHistory, setDiceHistory] = useState<{ player: string; total: number }[]>([]);

  const handleNavChange = (tab: string) => {
    const routes: Record<string, string> = {
      home: '/', tasks: '/tasks', expenses: '/expenses', storage: '/storage', chat: '/chat',
    };
    navigate(routes[tab] || '/');
  };

  // Global join handler
  const handleGlobalJoin = async () => {
    if (!joinCodeInput.trim()) {
      toast.error("Enter a game code to join");
      return;
    }

    const joinedLobby = await gameLobby.joinLobby(joinCodeInput);
    if (joinedLobby) {
      const gameTypeMap: Record<string, GameType> = {
        snakes_and_ladders: 'snakes',
        ludo: 'ludo',
        chopat: 'chopat',
        kabaddi_tap: 'kabaddi',
        tictactoe: 'tictactoe',
      };
      const target = gameTypeMap[joinedLobby.game_type] || 'menu';
      setCurrentGame(target);
      setJoinCodeInput("");
    }
  };

  // Tic Tac Toe logic
  const calculateWinner = (squares: (string | null)[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (const [a, b, c] of lines) {
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) return squares[a];
    }
    return null;
  };

  const handleTttClick = (index: number) => {
    if (tttBoard[index] || tttWinner) return;
    const newBoard = [...tttBoard];
    newBoard[index] = tttIsXNext ? 'X' : 'O';
    setTttBoard(newBoard);
    setTttIsXNext(!tttIsXNext);
    
    const winner = calculateWinner(newBoard);
    if (winner) {
      setTttWinner(winner);
      toast.success(`${winner} wins! 🎉`);
      if (user) {
        saveGameResult({
          gameType: 'tictactoe', winnerId: user.id, playerIds: [user.id], result: 'completed',
        });
      }
    } else if (newBoard.every(cell => cell !== null)) {
      setTttWinner('draw');
      toast.info("It's a draw!");
    }
  };

  const resetTtt = () => {
    setTttBoard(Array(9).fill(null));
    setTttIsXNext(true);
    setTttWinner(null);
  };

  // Memory Game logic
  const initMemory = () => {
    const emojis = ['🎮', '🎲', '🎯', '🏆', '⚡', '🎪', '🎨', '🎭'];
    const cards = [...emojis, ...emojis]
      .sort(() => Math.random() - 0.5)
      .map((emoji, id) => ({ id, emoji, isFlipped: false, isMatched: false }));
    setMemoryCards(cards);
    setMemoryFlipped([]);
    setMemoryMoves(0);
    setMemoryMatched(0);
  };

  const handleMemoryClick = (id: number) => {
    if (memoryFlipped.length === 2) return;
    if (memoryCards[id].isFlipped || memoryCards[id].isMatched) return;
    const newCards = [...memoryCards];
    newCards[id].isFlipped = true;
    setMemoryCards(newCards);
    const newFlipped = [...memoryFlipped, id];
    setMemoryFlipped(newFlipped);
    if (newFlipped.length === 2) {
      setMemoryMoves(m => m + 1);
      const [first, second] = newFlipped;
      if (memoryCards[first].emoji === memoryCards[second].emoji) {
        setTimeout(() => {
          const matched = [...memoryCards];
          matched[first].isMatched = true;
          matched[second].isMatched = true;
          setMemoryCards(matched);
          setMemoryFlipped([]);
          setMemoryMatched(m => m + 1);
          if (memoryMatched + 1 === 8) {
            toast.success(`You won in ${memoryMoves + 1} moves! 🎉`);
            if (user) saveGameResult({ gameType: 'memory', winnerId: user.id, playerIds: [user.id], result: 'completed', score: { moves: memoryMoves + 1 } });
          }
        }, 500);
      } else {
        setTimeout(() => {
          const reset = [...memoryCards];
          reset[first].isFlipped = false;
          reset[second].isFlipped = false;
          setMemoryCards(reset);
          setMemoryFlipped([]);
        }, 1000);
      }
    }
  };

  // Reaction Time logic
  const startReaction = useCallback(() => {
    setReactionState('ready');
    setReactionTime(null);
    const delay = Math.random() * 4000 + 1000;
    const timeout = setTimeout(() => {
      setReactionState('go');
      setReactionStartTime(Date.now());
    }, delay);
    return () => clearTimeout(timeout);
  }, []);

  const handleReactionClick = async () => {
    if (reactionState === 'waiting') { startReaction(); }
    else if (reactionState === 'ready') { setReactionState('early'); }
    else if (reactionState === 'go') {
      const time = Date.now() - reactionStartTime;
      setReactionTime(time);
      setReactionState('clicked');
      if (!reactionBestTime || time < reactionBestTime) {
        setReactionBestTime(time);
        toast.success(`New best: ${time}ms! 🏆`);
      }
      if (user) {
        saveGameResult({ gameType: 'reaction', winnerId: user.id, playerIds: [user.id], result: 'completed', score: { time_ms: time } });
      }
    } else { setReactionState('waiting'); }
  };

  // Dice logic
  const rollDice = async () => {
    setDiceRolling(true);
    let count = 0;
    const interval = setInterval(() => {
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      setDiceValues([d1, d2]);
      count++;
      if (count >= 10) {
        clearInterval(interval);
        setDiceRolling(false);
        setDiceHistory(prev => [...prev, { player: profile?.display_name || 'You', total: d1 + d2 }].slice(-10));
      }
    }, 100);
  };

  const getDiceEmoji = (value: number) => ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][value - 1];

  useEffect(() => {
    if (currentGame === 'memory' && memoryCards.length === 0) initMemory();
  }, [currentGame, memoryCards.length]);

  const GAME_LIST = [
    { id: 'snakes' as GameType, name: 'Snakes & Ladders', icon: '🐍', desc: '2-6 players • Classic', gradient: 'gradient-mint', multiplayer: true, category: 'board' },
    { id: 'ludo' as GameType, name: 'Ludo', icon: '🎲', desc: '2-4 players • Race game', gradient: 'gradient-primary', multiplayer: true, category: 'board' },
    { id: 'chopat' as GameType, name: 'Chopat', icon: '🐚', desc: '2-4 players • Ancient Indian', gradient: 'gradient-gold', multiplayer: true, category: 'indian' },
    { id: 'kabaddi' as GameType, name: 'Kabaddi Tap', icon: '🤼', desc: '2-6 players • Tap challenge', gradient: 'gradient-coral', multiplayer: true, category: 'indian' },
    { id: 'tictactoe' as GameType, name: 'Tic Tac Toe', icon: '❌', desc: 'Local 2-player', gradient: 'bg-primary/10', multiplayer: false, category: 'quick' },
    { id: 'memory' as GameType, name: 'Memory Match', icon: '🧠', desc: 'Match the pairs', gradient: 'bg-accent/10', multiplayer: false, category: 'quick' },
    { id: 'reaction' as GameType, name: 'Reaction Time', icon: '⚡', desc: 'Test your speed', gradient: 'bg-secondary/10', multiplayer: false, category: 'quick' },
    { id: 'dice' as GameType, name: 'Dice Roller', icon: '🎲', desc: 'Roll dice together', gradient: 'bg-muted', multiplayer: false, category: 'quick' },
  ];

  // In solo mode, only show local/quick games
  const filteredGames = isSoloMode
    ? GAME_LIST.filter(g => !g.multiplayer)
    : GAME_LIST;

  const renderGame = () => {
    switch (currentGame) {
      case 'snakes': return <SnakesAndLadders onBack={() => setCurrentGame('menu')} gameLobby={gameLobby} />;
      case 'ludo': return <LudoGame onBack={() => setCurrentGame('menu')} gameLobby={gameLobby} />;
      case 'chopat': return <ChopathGame onBack={() => setCurrentGame('menu')} gameLobby={gameLobby} />;
      case 'kabaddi': return <KabaddiTapGame onBack={() => setCurrentGame('menu')} gameLobby={gameLobby} />;
      
      case 'tictactoe':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">❌ Tic Tac Toe</h2>
              {tttWinner ? (
                <Badge variant={tttWinner === 'draw' ? 'secondary' : 'default'}>
                  {tttWinner === 'draw' ? "It's a draw!" : `${tttWinner} wins!`}
                </Badge>
              ) : (
                <Badge variant="default">{tttIsXNext ? 'X' : 'O'}'s turn</Badge>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 max-w-[250px] mx-auto">
              {tttBoard.map((cell, i) => (
                <Button key={i} variant="outline"
                  className={cn("h-20 text-3xl font-bold", cell === 'X' && "text-primary", cell === 'O' && "text-secondary")}
                  onClick={() => handleTttClick(i)} disabled={!!tttWinner}
                >{cell}</Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={resetTtt} className="flex-1"><RotateCcw className="h-4 w-4 mr-2" />Play Again</Button>
              <Button variant="outline" onClick={() => { resetTtt(); setCurrentGame('menu'); }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case 'memory':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">🧠 Memory Match</h2>
              <div className="flex gap-4 justify-center">
                <Badge variant="outline">Moves: {memoryMoves}</Badge>
                <Badge variant="secondary">Matched: {memoryMatched}/8</Badge>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 max-w-[280px] mx-auto">
              {memoryCards.map((card) => (
                <Button key={card.id} variant={card.isMatched ? 'default' : 'outline'}
                  className={cn("h-16 text-2xl", card.isMatched && "bg-primary/20 border-primary")}
                  onClick={() => handleMemoryClick(card.id)} disabled={card.isMatched}
                >{card.isFlipped || card.isMatched ? card.emoji : '❓'}</Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={initMemory} className="flex-1"><RotateCcw className="h-4 w-4 mr-2" />New Game</Button>
              <Button variant="outline" onClick={() => setCurrentGame('menu')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case 'reaction':
        const bgColors: Record<string, string> = { waiting: 'bg-muted', ready: 'bg-secondary', go: 'bg-primary', clicked: 'bg-primary', early: 'bg-destructive' };
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">⚡ Reaction Time</h2>
              {reactionBestTime && (
                <Badge variant="secondary"><Trophy className="h-3 w-3 mr-1" />Best: {reactionBestTime}ms</Badge>
              )}
            </div>
            <div onClick={handleReactionClick}
              className={cn("h-48 rounded-2xl flex items-center justify-center cursor-pointer transition-colors", bgColors[reactionState])}>
              <div className="text-center text-primary-foreground">
                {reactionState === 'waiting' && <><Zap className="h-12 w-12 mx-auto mb-2" /><p className="text-lg font-bold">Click to Start</p></>}
                {reactionState === 'ready' && <><Timer className="h-12 w-12 mx-auto mb-2 animate-pulse" /><p className="text-lg font-bold">Wait for green...</p></>}
                {reactionState === 'go' && <><Target className="h-12 w-12 mx-auto mb-2" /><p className="text-lg font-bold">CLICK NOW!</p></>}
                {reactionState === 'clicked' && <><Trophy className="h-12 w-12 mx-auto mb-2" /><p className="text-4xl font-bold">{reactionTime}ms</p><p className="text-sm opacity-80 mt-2">Click to try again</p></>}
                {reactionState === 'early' && <><p className="text-4xl font-bold">Too early!</p><p className="text-sm opacity-80 mt-2">Click to try again</p></>}
              </div>
            </div>
            <Button variant="outline" onClick={() => { setReactionState('waiting'); setCurrentGame('menu'); }} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
          </div>
        );

      case 'dice':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">🎲 Dice Roller</h2>
            </div>
            <div className="flex justify-center gap-4">
              {diceValues.map((value, i) => (
                <div key={i} className={cn("w-20 h-20 bg-card rounded-xl flex items-center justify-center text-5xl shadow-lg border", diceRolling && "animate-bounce")}>
                  {getDiceEmoji(value)}
                </div>
              ))}
            </div>
            <div className="text-center">
              <Badge variant="default" className="text-2xl px-6 py-2">Total: {diceValues[0] + diceValues[1]}</Badge>
            </div>
            <Button onClick={rollDice} disabled={diceRolling} className="w-full gradient-primary" size="lg">
              <Dices className="h-5 w-5 mr-2" />{diceRolling ? 'Rolling...' : 'Roll Dice'}
            </Button>
            {diceHistory.length > 0 && (
              <div className="bg-card rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-2">Roll History</h3>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {diceHistory.slice().reverse().map((entry, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{entry.player}</span><Badge variant="outline">{entry.total}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button variant="outline" onClick={() => setCurrentGame('menu')} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
          </div>
        );

      case 'stats':
        return (
          <div>
            <GameStatsDashboard onClose={() => setCurrentGame('menu')} />
            <Button variant="outline" onClick={() => setCurrentGame('menu')} className="w-full mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
          </div>
        );

      default:
        // GAME MENU
        return (
          <div className="space-y-5">
            {/* Join Game - hidden in solo mode */}
            {!isSoloMode && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Share2 className="h-4 w-4 text-primary" />
                    Join a Game
                  </h3>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter game code..."
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                      className="flex-1 font-mono tracking-wider"
                      maxLength={6}
                    />
                    <Button onClick={handleGlobalJoin} disabled={!joinCodeInput.trim()}>
                      Join
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Multiplayer Board Games - hidden in solo mode */}
            {!isSoloMode && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Multiplayer Games
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {filteredGames.filter(g => g.multiplayer).map((game) => (
                    <Card
                      key={game.id}
                      className="cursor-pointer hover:shadow-md transition-all press-effect overflow-hidden"
                      onClick={() => setCurrentGame(game.id)}
                    >
                      <CardContent className="p-4 text-center">
                        <div className={cn("w-12 h-12 mx-auto mb-2 rounded-xl flex items-center justify-center text-2xl", game.gradient)}>
                          {game.icon}
                        </div>
                        <h4 className="font-semibold text-sm">{game.name}</h4>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{game.desc}</p>
                        <Badge variant="outline" className="mt-2 text-[9px]">
                          <Share2 className="h-2 w-2 mr-1" />
                          Online
                        </Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Quick / Local Games */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Quick Games
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {filteredGames.filter(g => !g.multiplayer).map((game) => (
                  <Card
                    key={game.id}
                    className="cursor-pointer hover:shadow-md transition-all press-effect"
                    onClick={() => setCurrentGame(game.id)}
                  >
                    <CardContent className="p-4 text-center">
                      <div className={cn("w-12 h-12 mx-auto mb-2 rounded-xl flex items-center justify-center text-2xl", game.gradient)}>
                        {game.icon}
                      </div>
                      <h4 className="font-semibold text-sm">{game.name}</h4>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{game.desc}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Stats */}
            <Card className="cursor-pointer hover:shadow-md transition-all press-effect bg-accent/10" onClick={() => setCurrentGame('stats')}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center">
                  <Trophy className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Leaderboard & Stats</h3>
                  <p className="text-xs text-muted-foreground">See wins, losses & rankings</p>
                </div>
              </CardContent>
            </Card>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <TopBar 
        title={currentGame === 'menu' ? 'Games' : undefined}
        showBack={true}
        onBack={() => currentGame === 'menu' ? navigate('/') : setCurrentGame('menu')}
        hint="Play games with your roommates! 🎮"
      />
      <div className="p-4 max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-5">
            {renderGame()}
          </CardContent>
        </Card>
      </div>
      <BottomNav activeTab="home" onTabChange={handleNavChange} />
    </div>
  );
}
