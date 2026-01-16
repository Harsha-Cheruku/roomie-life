import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Gamepad2, 
  Dices, 
  Target, 
  Timer,
  Trophy,
  RotateCcw,
  Zap,
  Grid3X3
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

export default function Games() {
  const navigate = useNavigate();
  const { currentRoom, profile } = useAuth();
  const [currentGame, setCurrentGame] = useState<GameType>('menu');
  
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
  const [diceHistory, setDiceHistory] = useState<number[]>([]);

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
    
    const delay = Math.random() * 4000 + 1000; // 1-5 seconds
    const timeout = setTimeout(() => {
      setReactionState('go');
      setReactionStartTime(Date.now());
    }, delay);

    return () => clearTimeout(timeout);
  }, []);

  const handleReactionClick = () => {
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
    } else {
      setReactionState('waiting');
    }
  };

  // Dice logic
  const rollDice = () => {
    setDiceRolling(true);
    const rolls: number[][] = [];
    
    // Animate dice
    let count = 0;
    const interval = setInterval(() => {
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      setDiceValues([d1, d2]);
      count++;
      
      if (count >= 10) {
        clearInterval(interval);
        setDiceRolling(false);
        setDiceHistory(prev => [...prev, d1 + d2].slice(-10));
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
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">Tic Tac Toe</h2>
              {tttWinner ? (
                <Badge variant={tttWinner === 'draw' ? 'secondary' : 'default'}>
                  {tttWinner === 'draw' ? "It's a draw!" : `${tttWinner} wins!`}
                </Badge>
              ) : (
                <Badge variant="outline">
                  {tttIsXNext ? 'X' : 'O'}'s turn
                </Badge>
              )}
            </div>
            
            <div className="grid grid-cols-3 gap-2 max-w-[250px] mx-auto">
              {tttBoard.map((cell, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className="h-20 text-3xl font-bold"
                  onClick={() => handleTttClick(i)}
                  disabled={!!tttWinner}
                >
                  {cell}
                </Button>
              ))}
            </div>
            
            <Button onClick={resetTtt} className="w-full">
              <RotateCcw className="h-4 w-4 mr-2" />
              Play Again
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
                  Best: {reactionBestTime}ms
                </Badge>
              )}
            </div>
            
            <div
              onClick={handleReactionClick}
              className={cn(
                "h-64 rounded-2xl flex items-center justify-center cursor-pointer transition-colors",
                bgColors[reactionState]
              )}
            >
              <div className="text-center text-white">
                {reactionState === 'waiting' && (
                  <>
                    <Zap className="h-16 w-16 mx-auto mb-4" />
                    <p className="text-lg font-bold">Click to Start</p>
                  </>
                )}
                {reactionState === 'ready' && (
                  <>
                    <Timer className="h-16 w-16 mx-auto mb-4 animate-pulse" />
                    <p className="text-lg font-bold">Wait for green...</p>
                  </>
                )}
                {reactionState === 'go' && (
                  <>
                    <Target className="h-16 w-16 mx-auto mb-4" />
                    <p className="text-lg font-bold">CLICK NOW!</p>
                  </>
                )}
                {reactionState === 'clicked' && (
                  <>
                    <Trophy className="h-16 w-16 mx-auto mb-4" />
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
          </div>
        );

      case 'dice':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">Dice Roller</h2>
              <p className="text-muted-foreground text-sm">For board games & decisions</p>
            </div>
            
            <div className="flex justify-center gap-4">
              {diceValues.map((value, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-24 h-24 bg-card rounded-xl flex items-center justify-center text-6xl shadow-lg border",
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
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-2">Recent rolls:</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  {diceHistory.map((total, i) => (
                    <Badge key={i} variant="outline">{total}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      default:
        return (
          <div className="grid grid-cols-2 gap-4">
            {[
              { id: 'tictactoe', name: 'Tic Tac Toe', icon: Grid3X3, color: 'bg-primary/10', desc: 'Classic 2-player' },
              { id: 'memory', name: 'Memory Match', icon: Target, color: 'bg-mint/10', desc: 'Match the pairs' },
              { id: 'reaction', name: 'Reaction Time', icon: Zap, color: 'bg-coral/10', desc: 'Test your speed' },
              { id: 'dice', name: 'Dice Roller', icon: Dices, color: 'bg-lavender/10', desc: 'For board games' },
            ].map((game) => (
              <Card
                key={game.id}
                className={cn("cursor-pointer hover:shadow-md transition-all", game.color)}
                onClick={() => setCurrentGame(game.id as GameType)}
              >
                <CardContent className="p-6 text-center">
                  <game.icon className="h-12 w-12 mx-auto mb-3 text-primary" />
                  <h3 className="font-semibold">{game.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{game.desc}</p>
                </CardContent>
              </Card>
            ))}
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
        hint="Fun games for roommates 🎮"
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