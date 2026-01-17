import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Gamepad2, 
  Dices, 
  Target, 
  Timer,
  Trophy,
  RotateCcw,
  Zap,
  Grid3X3,
  Users,
  Share2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type GameType = 'menu' | 'tictactoe' | 'memory' | 'reaction' | 'dice';

interface MemoryCard {
  id: number;
  emoji: string;
  isFlipped: boolean;
  isMatched: boolean;
}

interface OnlinePlayer {
  user_id: string;
  display_name: string;
  avatar: string;
  online_at: string;
}

interface GameState {
  board: (string | null)[];
  currentPlayer: string;
  winner: string | null;
  players: { X: string; O: string };
  started: boolean;
}

export default function Games() {
  const navigate = useNavigate();
  const { currentRoom, profile, user } = useAuth();
  const [currentGame, setCurrentGame] = useState<GameType>('menu');
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([]);
  
  // Tic Tac Toe state
  const [tttBoard, setTttBoard] = useState<(string | null)[]>(Array(9).fill(null));
  const [tttIsXNext, setTttIsXNext] = useState(true);
  const [tttWinner, setTttWinner] = useState<string | null>(null);
  const [tttGameState, setTttGameState] = useState<GameState | null>(null);
  const [tttMySymbol, setTttMySymbol] = useState<'X' | 'O' | null>(null);
  
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
  const [reactionLeaderboard, setReactionLeaderboard] = useState<{ name: string; time: number }[]>([]);
  
  // Dice state
  const [diceValues, setDiceValues] = useState<number[]>([1, 1]);
  const [diceRolling, setDiceRolling] = useState(false);
  const [diceHistory, setDiceHistory] = useState<{ player: string; total: number }[]>([]);

  const handleNavChange = (tab: string) => {
    const routes: Record<string, string> = {
      home: '/',
      tasks: '/tasks',
      expenses: '/expenses',
      storage: '/storage',
      chat: '/chat',
    };
    navigate(routes[tab] || '/');
  };

  // Multiplayer presence tracking
  useEffect(() => {
    if (!currentRoom?.id || !user || !profile) return;

    const channel = supabase.channel(`games-room-${currentRoom.id}`);
    
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const players: OnlinePlayer[] = [];
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.user_id && !players.find(pl => pl.user_id === p.user_id)) {
              players.push({
                user_id: p.user_id,
                display_name: p.display_name,
                avatar: p.avatar,
                online_at: p.online_at
              });
            }
          });
        });
        setOnlinePlayers(players);
      })
      .on('broadcast', { event: 'game_update' }, (payload) => {
        handleGameUpdate(payload.payload);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            display_name: profile.display_name,
            avatar: profile.avatar,
            online_at: new Date().toISOString()
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRoom?.id, user?.id, profile]);

  const handleGameUpdate = (payload: any) => {
    if (payload.type === 'tictactoe') {
      setTttGameState(payload.state);
      setTttBoard(payload.state.board);
      setTttWinner(payload.state.winner);
      
      // Update my symbol
      if (payload.state.players.X === user?.id) {
        setTttMySymbol('X');
      } else if (payload.state.players.O === user?.id) {
        setTttMySymbol('O');
      }
      
      if (payload.state.winner) {
        const winnerName = payload.state.winner === 'draw' 
          ? "It's a draw!" 
          : payload.state.winner === tttMySymbol 
            ? "You win! 🎉" 
            : "You lost!";
        toast(winnerName);
      }
    } else if (payload.type === 'dice') {
      setDiceHistory(prev => [...prev, { player: payload.player, total: payload.total }].slice(-10));
      if (payload.player !== profile?.display_name) {
        toast(`${payload.player} rolled ${payload.total}!`);
      }
    } else if (payload.type === 'reaction') {
      setReactionLeaderboard(prev => {
        const updated = [...prev, { name: payload.player, time: payload.time }]
          .sort((a, b) => a.time - b.time)
          .slice(0, 5);
        return updated;
      });
    }
  };

  const broadcastGameUpdate = async (type: string, data: any) => {
    if (!currentRoom?.id) return;
    
    const channel = supabase.channel(`games-room-${currentRoom.id}`);
    await channel.send({
      type: 'broadcast',
      event: 'game_update',
      payload: { type, ...data }
    });
  };

  // Tic Tac Toe logic
  const calculateWinner = (squares: (string | null)[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (const [a, b, c] of lines) {
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return squares[a];
      }
    }
    return null;
  };

  const startMultiplayerTtt = async () => {
    if (!user || !profile) return;
    
    const newState: GameState = {
      board: Array(9).fill(null),
      currentPlayer: user.id,
      winner: null,
      players: { X: user.id, O: '' },
      started: false
    };
    
    setTttGameState(newState);
    setTttMySymbol('X');
    setIsMultiplayer(true);
    setCurrentGame('tictactoe');
    
    await broadcastGameUpdate('tictactoe', { state: newState });
    toast.success("Game created! Waiting for opponent...");
  };

  const joinMultiplayerTtt = async () => {
    if (!user || !tttGameState) return;
    
    const newState: GameState = {
      ...tttGameState,
      players: { ...tttGameState.players, O: user.id },
      started: true
    };
    
    setTttGameState(newState);
    setTttMySymbol('O');
    
    await broadcastGameUpdate('tictactoe', { state: newState });
    toast.success("Joined! Game started!");
  };

  const handleTttClick = async (index: number) => {
    if (tttBoard[index] || tttWinner) return;
    
    if (isMultiplayer && tttGameState) {
      // Check if it's my turn
      const isMyTurn = 
        (tttGameState.currentPlayer === user?.id) ||
        (!tttGameState.started && tttMySymbol === 'X');
      
      if (!isMyTurn) {
        toast.error("Wait for your turn!");
        return;
      }
      
      const newBoard = [...tttBoard];
      newBoard[index] = tttMySymbol;
      setTttBoard(newBoard);
      
      const winner = calculateWinner(newBoard);
      const isDraw = !winner && newBoard.every(cell => cell !== null);
      
      const nextPlayer = tttMySymbol === 'X' 
        ? tttGameState.players.O 
        : tttGameState.players.X;
      
      const newState: GameState = {
        ...tttGameState,
        board: newBoard,
        currentPlayer: nextPlayer,
        winner: isDraw ? 'draw' : winner,
      };
      
      setTttGameState(newState);
      setTttWinner(isDraw ? 'draw' : winner);
      
      await broadcastGameUpdate('tictactoe', { state: newState });
    } else {
      // Local play
      const newBoard = [...tttBoard];
      newBoard[index] = tttIsXNext ? 'X' : 'O';
      setTttBoard(newBoard);
      setTttIsXNext(!tttIsXNext);
      
      const winner = calculateWinner(newBoard);
      if (winner) {
        setTttWinner(winner);
        toast.success(`${winner} wins! 🎉`);
      } else if (newBoard.every(cell => cell !== null)) {
        setTttWinner('draw');
        toast.info("It's a draw!");
      }
    }
  };

  const resetTtt = () => {
    setTttBoard(Array(9).fill(null));
    setTttIsXNext(true);
    setTttWinner(null);
    setTttGameState(null);
    setTttMySymbol(null);
    setIsMultiplayer(false);
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
    if (reactionState === 'waiting') {
      startReaction();
    } else if (reactionState === 'ready') {
      setReactionState('early');
    } else if (reactionState === 'go') {
      const time = Date.now() - reactionStartTime;
      setReactionTime(time);
      setReactionState('clicked');
      
      if (!reactionBestTime || time < reactionBestTime) {
        setReactionBestTime(time);
        toast.success(`New best: ${time}ms! 🏆`);
      }
      
      // Share with room
      if (profile) {
        await broadcastGameUpdate('reaction', { 
          player: profile.display_name, 
          time 
        });
        setReactionLeaderboard(prev => {
          const updated = [...prev, { name: profile.display_name, time }]
            .sort((a, b) => a.time - b.time)
            .slice(0, 5);
          return updated;
        });
      }
    } else {
      setReactionState('waiting');
    }
  };

  // Dice logic
  const rollDice = async () => {
    setDiceRolling(true);
    
    let count = 0;
    const interval = setInterval(async () => {
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      setDiceValues([d1, d2]);
      count++;
      
      if (count >= 10) {
        clearInterval(interval);
        setDiceRolling(false);
        
        const total = d1 + d2;
        const entry = { player: profile?.display_name || 'You', total };
        setDiceHistory(prev => [...prev, entry].slice(-10));
        
        // Share with room
        await broadcastGameUpdate('dice', entry);
      }
    }, 100);
  };

  const getDiceEmoji = (value: number) => {
    const dice = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    return dice[value - 1];
  };

  useEffect(() => {
    if (currentGame === 'memory' && memoryCards.length === 0) {
      initMemory();
    }
  }, [currentGame, memoryCards.length]);

  const renderGame = () => {
    switch (currentGame) {
      case 'tictactoe':
        const isMyTurn = isMultiplayer 
          ? (tttGameState?.currentPlayer === user?.id || (!tttGameState?.started && tttMySymbol === 'X'))
          : true;
        
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">Tic Tac Toe</h2>
              {isMultiplayer && (
                <div className="mb-2">
                  <Badge variant="outline" className="bg-primary/10">
                    Multiplayer Mode
                  </Badge>
                  {tttMySymbol && (
                    <Badge variant="secondary" className="ml-2">
                      You are {tttMySymbol}
                    </Badge>
                  )}
                </div>
              )}
              {tttWinner ? (
                <Badge variant={tttWinner === 'draw' ? 'secondary' : 'default'}>
                  {tttWinner === 'draw' ? "It's a draw!" : `${tttWinner} wins!`}
                </Badge>
              ) : (
                <Badge variant={isMyTurn ? 'default' : 'secondary'}>
                  {isMultiplayer 
                    ? (isMyTurn ? "Your turn!" : "Waiting for opponent...")
                    : `${tttIsXNext ? 'X' : 'O'}'s turn`
                  }
                </Badge>
              )}
            </div>
            
            <div className="grid grid-cols-3 gap-2 max-w-[250px] mx-auto">
              {tttBoard.map((cell, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className={cn(
                    "h-20 text-3xl font-bold",
                    cell === 'X' && "text-primary",
                    cell === 'O' && "text-coral"
                  )}
                  onClick={() => handleTttClick(i)}
                  disabled={!!tttWinner || (isMultiplayer && !isMyTurn)}
                >
                  {cell}
                </Button>
              ))}
            </div>
            
            <Button onClick={resetTtt} className="w-full">
              <RotateCcw className="h-4 w-4 mr-2" />
              {isMultiplayer ? 'Leave Game' : 'Play Again'}
            </Button>
          </div>
        );

      case 'memory':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">Memory Match</h2>
              <div className="flex gap-4 justify-center">
                <Badge variant="outline">Moves: {memoryMoves}</Badge>
                <Badge variant="secondary">Matched: {memoryMatched}/8</Badge>
              </div>
            </div>
            
            <div className="grid grid-cols-4 gap-2 max-w-[280px] mx-auto">
              {memoryCards.map((card) => (
                <Button
                  key={card.id}
                  variant={card.isMatched ? 'default' : 'outline'}
                  className={cn(
                    "h-16 text-2xl",
                    card.isMatched && "bg-mint/20 border-mint"
                  )}
                  onClick={() => handleMemoryClick(card.id)}
                  disabled={card.isMatched}
                >
                  {card.isFlipped || card.isMatched ? card.emoji : '❓'}
                </Button>
              ))}
            </div>
            
            <Button onClick={initMemory} className="w-full">
              <RotateCcw className="h-4 w-4 mr-2" />
              New Game
            </Button>
          </div>
        );

      case 'reaction':
        const bgColors = {
          waiting: 'bg-muted',
          ready: 'bg-coral',
          go: 'bg-mint',
          clicked: 'bg-primary',
          early: 'bg-destructive'
        };
        
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">Reaction Time</h2>
              {reactionBestTime && (
                <Badge variant="secondary" className="mb-2">
                  <Trophy className="h-3 w-3 mr-1" />
                  Your Best: {reactionBestTime}ms
                </Badge>
              )}
            </div>
            
            <div
              onClick={handleReactionClick}
              className={cn(
                "h-48 rounded-2xl flex items-center justify-center cursor-pointer transition-colors",
                bgColors[reactionState]
              )}
            >
              <div className="text-center text-white">
                {reactionState === 'waiting' && (
                  <>
                    <Zap className="h-12 w-12 mx-auto mb-2" />
                    <p className="text-lg font-bold">Click to Start</p>
                  </>
                )}
                {reactionState === 'ready' && (
                  <>
                    <Timer className="h-12 w-12 mx-auto mb-2 animate-pulse" />
                    <p className="text-lg font-bold">Wait for green...</p>
                  </>
                )}
                {reactionState === 'go' && (
                  <>
                    <Target className="h-12 w-12 mx-auto mb-2" />
                    <p className="text-lg font-bold">CLICK NOW!</p>
                  </>
                )}
                {reactionState === 'clicked' && (
                  <>
                    <Trophy className="h-12 w-12 mx-auto mb-2" />
                    <p className="text-4xl font-bold">{reactionTime}ms</p>
                    <p className="text-sm opacity-80 mt-2">Click to try again</p>
                  </>
                )}
                {reactionState === 'early' && (
                  <>
                    <p className="text-4xl font-bold">Too early!</p>
                    <p className="text-sm opacity-80 mt-2">Click to try again</p>
                  </>
                )}
              </div>
            </div>
            
            {/* Room Leaderboard */}
            {reactionLeaderboard.length > 0 && (
              <div className="bg-card rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Room Leaderboard
                </h3>
                <div className="space-y-1">
                  {reactionLeaderboard.map((entry, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="flex items-center gap-2">
                        {i === 0 && <Trophy className="h-3 w-3 text-yellow-500" />}
                        {entry.name}
                      </span>
                      <span className="font-mono">{entry.time}ms</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'dice':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">Dice Roller</h2>
              <p className="text-muted-foreground text-sm">
                <Users className="h-3 w-3 inline mr-1" />
                Rolls are shared with roommates
              </p>
            </div>
            
            <div className="flex justify-center gap-4">
              {diceValues.map((value, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-20 h-20 bg-card rounded-xl flex items-center justify-center text-5xl shadow-lg border",
                    diceRolling && "animate-bounce"
                  )}
                >
                  {getDiceEmoji(value)}
                </div>
              ))}
            </div>
            
            <div className="text-center">
              <Badge variant="default" className="text-2xl px-6 py-2">
                Total: {diceValues[0] + diceValues[1]}
              </Badge>
            </div>
            
            <Button 
              onClick={rollDice} 
              disabled={diceRolling}
              className="w-full gradient-primary"
              size="lg"
            >
              <Dices className="h-5 w-5 mr-2" />
              {diceRolling ? 'Rolling...' : 'Roll Dice'}
            </Button>
            
            {diceHistory.length > 0 && (
              <div className="bg-card rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-2">Roll History</h3>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {diceHistory.slice().reverse().map((entry, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{entry.player}</span>
                      <Badge variant="outline">{entry.total}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      default:
        return (
          <div className="space-y-6">
            {/* Online Players */}
            {onlinePlayers.length > 0 && (
              <div className="bg-card rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4 text-mint" />
                  {onlinePlayers.length} Roommate{onlinePlayers.length !== 1 ? 's' : ''} Online
                </h3>
                <div className="flex -space-x-2">
                  {onlinePlayers.map((player) => (
                    <Avatar key={player.user_id} className="border-2 border-background w-8 h-8">
                      <AvatarFallback className="text-sm">{player.avatar}</AvatarFallback>
                    </Avatar>
                  ))}
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              {[
                { 
                  id: 'tictactoe', 
                  name: 'Tic Tac Toe', 
                  icon: Grid3X3, 
                  color: 'bg-primary/10', 
                  desc: 'Play with roommate',
                  multiplayer: true 
                },
                { 
                  id: 'memory', 
                  name: 'Memory Match', 
                  icon: Target, 
                  color: 'bg-mint/10', 
                  desc: 'Match the pairs',
                  multiplayer: false 
                },
                { 
                  id: 'reaction', 
                  name: 'Reaction Time', 
                  icon: Zap, 
                  color: 'bg-coral/10', 
                  desc: 'Compete with room',
                  multiplayer: true 
                },
                { 
                  id: 'dice', 
                  name: 'Dice Roller', 
                  icon: Dices, 
                  color: 'bg-lavender/10', 
                  desc: 'Shared rolls',
                  multiplayer: true 
                },
              ].map((game) => (
                <Card
                  key={game.id}
                  className={cn("cursor-pointer hover:shadow-md transition-all", game.color)}
                  onClick={() => {
                    if (game.id === 'tictactoe') {
                      startMultiplayerTtt();
                    } else {
                      setCurrentGame(game.id as GameType);
                    }
                  }}
                >
                  <CardContent className="p-6 text-center">
                    <game.icon className="h-10 w-10 mx-auto mb-2 text-primary" />
                    <h3 className="font-semibold text-sm">{game.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{game.desc}</p>
                    {game.multiplayer && (
                      <Badge variant="outline" className="mt-2 text-[10px]">
                        <Share2 className="h-2 w-2 mr-1" />
                        Multiplayer
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
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
          <CardContent className="p-6">
            {renderGame()}
          </CardContent>
        </Card>
      </div>

      <BottomNav activeTab="home" onTabChange={handleNavChange} />
    </div>
  );
}