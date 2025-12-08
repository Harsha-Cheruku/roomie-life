import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Home, Users, Plus, ArrowRight, Copy, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type SetupStep = "choice" | "create" | "join" | "success";

export const RoomSetup = () => {
  const [step, setStep] = useState<SetupStep>("choice");
  const [roomName, setRoomName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const { createRoom, joinRoom, currentRoom, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      toast({
        title: "Room name required",
        description: "Please enter a name for your room",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const { room, error } = await createRoom(roomName.trim());
    setIsLoading(false);

    if (error) {
      toast({
        title: "Failed to create room",
        description: error.message,
        variant: "destructive",
      });
    } else if (room) {
      setStep("success");
    }
  };

  const handleJoinRoom = async () => {
    if (!inviteCode.trim()) {
      toast({
        title: "Invite code required",
        description: "Please enter the room invite code",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const { error } = await joinRoom(inviteCode.trim());
    setIsLoading(false);

    if (error) {
      toast({
        title: "Failed to join room",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Welcome! 🎉",
        description: "You've successfully joined the room",
      });
      navigate("/");
    }
  };

  const copyInviteCode = () => {
    if (currentRoom?.invite_code) {
      navigator.clipboard.writeText(currentRoom.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied!",
        description: "Invite code copied to clipboard",
      });
    }
  };

  if (step === "success" && currentRoom) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="text-center animate-scale-in">
          <div className="w-24 h-24 gradient-mint rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Check className="w-12 h-12 text-primary-foreground" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">
            Room Created! 🎉
          </h1>
          <p className="text-muted-foreground mb-8">
            Share this code with your roommates
          </p>

          <div className="bg-card rounded-2xl p-6 shadow-card mb-6">
            <p className="text-sm text-muted-foreground mb-2">Invite Code</p>
            <div className="flex items-center justify-center gap-3">
              <span className="font-display text-4xl font-bold text-primary tracking-widest">
                {currentRoom.invite_code}
              </span>
              <button
                onClick={copyInviteCode}
                className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-mint" />
                ) : (
                  <Copy className="w-5 h-5 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>

          <Button
            variant="gradient"
            size="lg"
            onClick={() => navigate("/")}
            className="w-full max-w-xs"
          >
            Enter Room
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </div>
    );
  }

  if (step === "create") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm animate-slide-up">
          <button
            onClick={() => setStep("choice")}
            className="text-muted-foreground mb-6 flex items-center gap-2 hover:text-foreground transition-colors"
          >
            ← Back
          </button>

          <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mb-6 shadow-glow">
            <Plus className="w-8 h-8 text-primary-foreground" />
          </div>

          <h1 className="font-display text-2xl font-bold text-foreground mb-2">
            Create Your Room
          </h1>
          <p className="text-muted-foreground mb-8">
            Give your room a name that everyone will recognize
          </p>

          <div className="space-y-4">
            <Input
              type="text"
              placeholder="e.g., Room 204, The Den, Casa..."
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="h-14 rounded-xl bg-card border border-border text-lg"
              maxLength={50}
            />

            <Button
              variant="gradient"
              size="lg"
              className="w-full"
              onClick={handleCreateRoom}
              disabled={isLoading}
            >
              {isLoading ? "Creating..." : "Create Room"}
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "join") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm animate-slide-up">
          <button
            onClick={() => setStep("choice")}
            className="text-muted-foreground mb-6 flex items-center gap-2 hover:text-foreground transition-colors"
          >
            ← Back
          </button>

          <div className="w-16 h-16 gradient-coral rounded-2xl flex items-center justify-center mb-6 shadow-coral">
            <Users className="w-8 h-8 text-primary-foreground" />
          </div>

          <h1 className="font-display text-2xl font-bold text-foreground mb-2">
            Join a Room
          </h1>
          <p className="text-muted-foreground mb-8">
            Enter the 6-character invite code from your roommate
          </p>

          <div className="space-y-4">
            <Input
              type="text"
              placeholder="Enter invite code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              className="h-14 rounded-xl bg-card border border-border text-lg text-center tracking-widest font-bold uppercase"
              maxLength={6}
            />

            <Button
              variant="gradientCoral"
              size="lg"
              className="w-full"
              onClick={handleJoinRoom}
              disabled={isLoading}
            >
              {isLoading ? "Joining..." : "Join Room"}
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="text-center mb-10 animate-scale-in">
        <div className="w-20 h-20 gradient-primary rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-glow">
          <Sparkles className="w-10 h-10 text-primary-foreground" />
        </div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Hey {profile?.display_name || "there"}! 👋
        </h1>
        <p className="text-muted-foreground mt-2">
          Let's get you set up with a room
        </p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <button
          onClick={() => setStep("create")}
          className={cn(
            "w-full bg-card rounded-2xl p-5 shadow-card flex items-center gap-4 text-left",
            "hover:shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]",
            "animate-slide-up"
          )}
        >
          <div className="w-14 h-14 gradient-primary rounded-xl flex items-center justify-center flex-shrink-0">
            <Home className="w-7 h-7 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">Create a Room</h3>
            <p className="text-sm text-muted-foreground">
              Start fresh and invite your roommates
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground" />
        </button>

        <button
          onClick={() => setStep("join")}
          className={cn(
            "w-full bg-card rounded-2xl p-5 shadow-card flex items-center gap-4 text-left",
            "hover:shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]",
            "animate-slide-up"
          )}
          style={{ animationDelay: "50ms" }}
        >
          <div className="w-14 h-14 gradient-coral rounded-xl flex items-center justify-center flex-shrink-0">
            <Users className="w-7 h-7 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">Join a Room</h3>
            <p className="text-sm text-muted-foreground">
              Have an invite code? Enter it here
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
};
