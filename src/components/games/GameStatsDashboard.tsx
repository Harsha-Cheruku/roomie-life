import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Trophy, Gamepad2, TrendingUp, Medal } from "lucide-react";

interface PlayerStats {
  user_id: string;
  display_name: string;
  avatar: string;
  wins: number;
  losses: number;
  draws: number;
  total: number;
}

interface GameStatsDashboardProps {
  onClose: () => void;
}

export const GameStatsDashboard = ({ onClose }: GameStatsDashboardProps) => {
  const { user, currentRoom } = useAuth();
  const [stats, setStats] = useState<PlayerStats[]>([]);
  const [totalGames, setTotalGames] = useState(0);
  const [gameBreakdown, setGameBreakdown] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  interface GameSession {
    id: string;
    room_id: string;
    game_type: string;
    winner_id: string | null;
    loser_id: string | null;
    player_ids: string[];
    result: string;
    score: Record<string, unknown>;
    created_at: string;
  }

  useEffect(() => {
    if (currentRoom?.id) fetchStats();
  }, [currentRoom?.id]);

  const fetchStats = async () => {
    if (!currentRoom?.id) return;

    try {
      const { data, error } = await supabase
        .from("game_sessions" as any)
        .select("*")
        .eq("room_id", currentRoom.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const allSessions = (data || []) as unknown as GameSession[];
      setTotalGames(allSessions.length);

      // Game type breakdown
      const breakdown: Record<string, number> = {};
      allSessions.forEach(s => {
        breakdown[s.game_type] = (breakdown[s.game_type] || 0) + 1;
      });
      setGameBreakdown(breakdown);

      // Get all unique player IDs
      const playerIds = new Set<string>();
      allSessions.forEach(s => {
        if (s.winner_id) playerIds.add(s.winner_id);
        if (s.loser_id) playerIds.add(s.loser_id);
        (s.player_ids as string[])?.forEach(id => playerIds.add(id));
      });

      // Fetch profiles
      const ids = Array.from(playerIds);
      if (ids.length === 0) {
        setStats([]);
        setIsLoading(false);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar")
        .in("user_id", ids);

      const profileMap = new Map(
        (profiles || []).map(p => [p.user_id, p])
      );

      // Calculate stats per player
      const playerStats: Record<string, PlayerStats> = {};
      ids.forEach(id => {
        const profile = profileMap.get(id);
        playerStats[id] = {
          user_id: id,
          display_name: profile?.display_name || "Unknown",
          avatar: profile?.avatar || "😊",
          wins: 0,
          losses: 0,
          draws: 0,
          total: 0,
        };
      });

      allSessions.forEach(session => {
        if (session.result === "draw") {
          (session.player_ids as string[])?.forEach(id => {
            if (playerStats[id]) {
              playerStats[id].draws++;
              playerStats[id].total++;
            }
          });
        } else {
          if (session.winner_id && playerStats[session.winner_id]) {
            playerStats[session.winner_id].wins++;
            playerStats[session.winner_id].total++;
          }
          if (session.loser_id && playerStats[session.loser_id]) {
            playerStats[session.loser_id].losses++;
            playerStats[session.loser_id].total++;
          }
        }
      });

      const sorted = Object.values(playerStats).sort((a, b) => b.wins - a.wins);
      setStats(sorted);
    } catch (error) {
      console.error("Error fetching game stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const gameTypeLabels: Record<string, string> = {
    tictactoe: "Tic Tac Toe",
    memory: "Memory Match",
    reaction: "Reaction Time",
    dice: "Dice Roller",
  };

  const myStats = stats.find(s => s.user_id === user?.id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8 text-muted-foreground animate-pulse">
          Loading stats...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold flex items-center justify-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Game Stats
        </h2>
      </div>

      {/* My Stats */}
      {myStats && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Your Stats
            </h3>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-2xl font-bold text-primary">{myStats.total}</p>
                <p className="text-[10px] text-muted-foreground">Played</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-500">{myStats.wins}</p>
                <p className="text-[10px] text-muted-foreground">Wins</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">{myStats.losses}</p>
                <p className="text-[10px] text-muted-foreground">Losses</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-muted-foreground">{myStats.draws}</p>
                <p className="text-[10px] text-muted-foreground">Draws</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Game Breakdown */}
      {Object.keys(gameBreakdown).length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Gamepad2 className="h-4 w-4" />
              Total Games: {totalGames}
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(gameBreakdown).map(([type, count]) => (
                <Badge key={type} variant="secondary">
                  {gameTypeLabels[type] || type}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leaderboard */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Medal className="h-4 w-4 text-yellow-500" />
            Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {stats.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">
              No games played yet. Start playing to see stats!
            </p>
          ) : (
            <div className="space-y-2">
              {stats.map((player, i) => (
                <div
                  key={player.user_id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/30"
                >
                  <span className="w-6 text-center font-bold text-sm">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                  </span>
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="text-sm">{player.avatar}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {player.display_name}
                      {player.user_id === user?.id && (
                        <span className="text-muted-foreground ml-1">(You)</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="text-green-500 font-semibold">{player.wins}W</span>
                    <span className="text-red-500">{player.losses}L</span>
                    <span className="text-muted-foreground">{player.draws}D</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
