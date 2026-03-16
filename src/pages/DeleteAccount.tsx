import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, AlertTriangle, Trash2, Loader2 } from "lucide-react";

export default function DeleteAccount() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirmText !== "DELETE" || !user) return;

    setIsDeleting(true);
    try {
      // Delete user's profile (cascades through RLS)
      await supabase.from("profiles").delete().eq("user_id", user.id);
      
      // Delete room memberships
      await supabase.from("room_members").delete().eq("user_id", user.id);

      // Sign out
      await signOut();

      toast({
        title: "Account data removed",
        description: "Your profile and room data have been deleted. Contact support to fully delete your auth account.",
      });
      navigate("/auth");
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Error",
        description: "Failed to delete account data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="px-4 pt-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-display text-xl font-bold text-foreground">Delete Account</h1>
        </div>
      </header>

      <div className="p-4 max-w-md mx-auto space-y-6 mt-8">
        <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-6 text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
          <h2 className="text-lg font-bold text-foreground">This action cannot be undone</h2>
          <p className="text-sm text-muted-foreground">
            Deleting your account will permanently remove your profile, room memberships, and all associated data. 
            Your expenses, tasks, and messages within rooms will remain for other room members.
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground">
            Type <strong className="text-destructive">DELETE</strong> to confirm
          </label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className="h-12 rounded-xl text-center text-lg font-mono"
          />
          <Button
            onClick={handleDelete}
            disabled={confirmText !== "DELETE" || isDeleting}
            variant="destructive"
            className="w-full h-12 rounded-xl gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete My Account
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}