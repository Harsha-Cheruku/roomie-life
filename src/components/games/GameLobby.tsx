import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { Copy, Crown, Check, Users, Lock, Play, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LobbyPlayer, GameLobby as GameLobbyType } from "@/hooks/useGameLobby";

interface GameLobbyProps {
  lobby: GameLobbyType;
  players: LobbyPlayer[];
  isHost: boolean;
  isLoading: boolean;
  maxPlayers: number;
  gameName: string;
  minPlayers?: number;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
}

export const GameLobbyComponent = ({
  lobby,
  players,
  isHost,
  isLoading,
  maxPlayers,
  gameName,
  minPlayers = 2,
  onReady,
  onStart,
  onLeave,
}: GameLobbyProps) => {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const myPlayer = players.find((p) => p.user_id === user?.id);
  const allReady = players.every((p) => p.is_ready);
  const canStart = isHost && allReady && players.length >= minPlayers;

  const copyCode = () => {
    navigator.clipboard.writeText(lobby.join_code);
    setCopied(true);
    toast.success("Code copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-bold">{gameName}</h2>
        <Badge variant="outline" className="mt-1">
          <Users className="h-3 w-3 mr-1" />
          {players.length}/{maxPlayers} Players
        </Badge>
      </div>

      {/* Join Code */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Share this code to invite players</p>
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl font-mono font-bold tracking-[0.3em] text-primary">
              {lobby.join_code}
            </span>
            <Button variant="ghost" size="icon" onClick={copyCode} className="h-8 w-8">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex items-center justify-center gap-1 mt-2 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            No one can join after game starts
          </div>
        </CardContent>
      </Card>

      {/* Players List */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Players</h3>
        {players.map((player, i) => (
          <div
            key={player.id}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl border transition-all",
              player.is_ready ? "bg-green-500/5 border-green-500/20" : "bg-card border-border"
            )}
          >
            <div className="relative">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="text-lg">{player.avatar}</AvatarFallback>
              </Avatar>
              {player.user_id === lobby.host_id && (
                <Crown className="h-3 w-3 text-yellow-500 absolute -top-1 -right-1" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {player.display_name}
                {player.user_id === user?.id && (
                  <span className="text-muted-foreground ml-1">(You)</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Player {i + 1}
              </p>
            </div>
            <Badge
              variant={player.is_ready ? "default" : "secondary"}
              className={cn(
                "text-xs",
                player.is_ready && "bg-green-500 hover:bg-green-600"
              )}
            >
              {player.is_ready ? "Ready" : "Not Ready"}
            </Badge>
          </div>
        ))}

        {/* Empty slots */}
        {Array.from({ length: maxPlayers - players.length }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-muted-foreground/20"
          >
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Waiting for player...</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {myPlayer && !isHost && (
          <Button
            onClick={() => onReady(!myPlayer.is_ready)}
            className={cn("w-full", myPlayer.is_ready ? "bg-muted text-foreground hover:bg-muted/80" : "gradient-primary")}
            disabled={isLoading}
          >
            {myPlayer.is_ready ? "Cancel Ready" : "Ready Up!"}
          </Button>
        )}

        {isHost && (
          <Button
            onClick={onStart}
            className="w-full gradient-primary"
            disabled={!canStart || isLoading}
          >
            <Play className="h-4 w-4 mr-2" />
            {!allReady
              ? "Waiting for all to be ready..."
              : players.length < minPlayers
              ? `Need ${minPlayers}+ players`
              : "Start Game!"}
          </Button>
        )}

        <Button variant="outline" onClick={onLeave} className="w-full" disabled={isLoading}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Leave Lobby
        </Button>
      </div>
    </div>
  );
};
