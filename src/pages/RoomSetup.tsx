import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Home, Users, Plus, ArrowRight, Copy, Check, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type SetupStep = "choice" | "create" | "join" | "success";

export const RoomSetup = () => {
  const [step, setStep] = useState<SetupStep>("choice");
  const [roomName, setRoomName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCheckingRooms, setIsCheckingRooms] = useState(true);
  const [searchParams] = useSearchParams();
  
  // Check if user is adding a new room (from settings)
  const isAddingRoom = searchParams.get('add') === 'true';
  
  const { createRoom, joinRoom, currentRoom, profile, userRooms, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Check if user already has rooms and redirect (only if NOT adding a new room)
  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      return;
    }

    if (!isAddingRoom) {
      if (user && currentRoom) {
        navigate("/", { replace: true });
        return;
      }
      if (user && userRooms.length > 0) {
        navigate("/", { replace: true });
        return;
      }
    }
    
    // Auth is done loading, show the UI
    setIsCheckingRooms(false);
  }, [user, currentRoom, userRooms, navigate, isAddingRoom, authLoading]);

  // Block room creation if user already has rooms (when adding a new room)
  const canCreateRoom = !isAddingRoom || userRooms.length === 0;
  const hasExistingRoom = userRooms.length > 0;

  const handleCreateRoom = async () => {
    // Block if user already has a room and is trying to add another
    if (isAddingRoom && hasExistingRoom) {
      toast({
        title: "Already in a room",
        description: "You're already part of a room. Please leave your current room first before creating a new one.",
        variant: "destructive",
      });
      return;
    }

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
      navigate("/", { replace: true });
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

  // Show loading while checking for existing rooms
  if (isCheckingRooms) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center animate-pulse">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

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
            onClick={() => navigate("/", { replace: true })}
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
            onClick={() => isAddingRoom ? navigate(-1) : setStep("choice")}
            className="text-muted-foreground mb-6 flex items-center gap-2 hover:text-foreground transition-colors press-effect"
          >
            ← Back
          </button>

          <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mb-6 shadow-glow">
            <Plus className="w-8 h-8 text-primary-foreground" />
          </div>

          <h1 className="font-display text-2xl font-bold text-foreground mb-2">
            Create Your Room ✨
          </h1>
          <p className="text-muted-foreground mb-8">
            Give your room a name that everyone will recognize
          </p>

          {/* Warning if user already has a room */}
          {isAddingRoom && hasExistingRoom && (
            <div className="bg-coral/10 border border-coral/30 rounded-xl p-4 mb-6">
              <p className="text-coral text-sm font-medium">⚠️ You're already in a room</p>
              <p className="text-coral/80 text-xs mt-1">
                You need to leave your current room before creating a new one. 
                Go to Room Settings to leave your current room.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-coral border-coral/30 hover:bg-coral/10"
                onClick={() => navigate('/room-settings')}
              >
                Go to Room Settings
              </Button>
            </div>
          )}

          <div className="space-y-4">
            <Input
              type="text"
              placeholder="e.g., Room 204, The Den, Casa..."
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="h-14 rounded-xl bg-card border border-border text-lg"
              maxLength={50}
              disabled={isAddingRoom && hasExistingRoom}
            />

            <Button
              variant="gradient"
              size="lg"
              className="w-full press-effect"
              onClick={handleCreateRoom}
              disabled={isLoading || (isAddingRoom && hasExistingRoom)}
            >
              {isLoading ? "Creating..." : "Create Room"}
              <ArrowRight className="w-5 h-5" />
            </Button>
            
            <p className="text-xs text-muted-foreground text-center">
              You can invite friends later 🎉
            </p>
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
            onClick={() => isAddingRoom ? navigate(-1) : setStep("choice")}
            className="text-muted-foreground mb-6 flex items-center gap-2 hover:text-foreground transition-colors press-effect"
          >
            ← Back
          </button>

          <div className="w-16 h-16 gradient-coral rounded-2xl flex items-center justify-center mb-6 shadow-coral">
            <Users className="w-8 h-8 text-primary-foreground" />
          </div>

          <h1 className="font-display text-2xl font-bold text-foreground mb-2">
            Join a Room 🏠
          </h1>
          <p className="text-muted-foreground mb-8">
            Enter the 6-character code from your roommate
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
              className="w-full press-effect"
              onClick={handleJoinRoom}
              disabled={isLoading}
            >
              {isLoading ? "Joining..." : "Join Room"}
              <ArrowRight className="w-5 h-5" />
            </Button>
            
            <p className="text-xs text-muted-foreground text-center">
              Ask your roommate for the code 💬
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      {isAddingRoom && (
        <button
          onClick={() => navigate(-1)}
          className="absolute top-6 left-6 text-muted-foreground flex items-center gap-2 hover:text-foreground transition-colors press-effect"
        >
          ← Back
        </button>
      )}
      <div className="text-center mb-10 animate-scale-in">
        <div className="w-20 h-20 gradient-primary rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-glow">
          <Sparkles className="w-10 h-10 text-primary-foreground" />
        </div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          {isAddingRoom ? "Add Another Room" : `Hey ${profile?.display_name || "there"}! 👋`}
        </h1>
        <p className="text-muted-foreground mt-2">
          {isAddingRoom ? "Create or join a new room" : "Let's get you set up with a room"}
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
