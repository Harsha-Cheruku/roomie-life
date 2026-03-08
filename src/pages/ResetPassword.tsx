import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Lock, Check, Sparkles, Loader2 } from "lucide-react";
import { z } from "zod";

const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

export const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [status, setStatus] = useState<"loading" | "ready" | "invalid">("loading");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    // Handle both hash-based (#access_token=...) and query-based (?code=...) recovery flows
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const type = params.get("type");

    // If there's a code param (PKCE flow), exchange it first
    if (code && type === "recovery") {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          console.error("Code exchange error:", error);
          setStatus("invalid");
        } else if (data.session) {
          setStatus("ready");
        }
      });
      return () => { mounted = false; };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      
      if (event === "PASSWORD_RECOVERY") {
        setStatus("ready");
      } else if (event === "SIGNED_IN" && session) {
        setTimeout(() => {
          if (mounted) setStatus(prev => prev === "loading" ? "ready" : prev);
        }, 500);
      }
    });

    // Check if already authenticated (recovery token already exchanged)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        setTimeout(() => {
          if (mounted) setStatus(prev => prev === "loading" ? "ready" : prev);
        }, 1000);
      } else if (!hash || (!hash.includes("type=recovery") && !hash.includes("access_token"))) {
        // No session, no hash tokens, no code param = invalid
        setTimeout(() => {
          if (mounted) setStatus(prev => prev === "loading" ? "invalid" : prev);
        }, 2500);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const validate = () => {
    const newErrors: { password?: string; confirm?: string } = {};
    const result = passwordSchema.safeParse(password);
    if (!result.success) {
      newErrors.password = result.error.errors[0].message;
    }
    if (password !== confirmPassword) {
      newErrors.confirm = "Passwords don't match";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setIsSuccess(true);
        toast({
          title: "Password updated! 🎉",
          description: "You can now sign in with your new password.",
        });
        // Sign out so they log in fresh with new password
        await supabase.auth.signOut();
        setTimeout(() => navigate("/auth"), 2000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm bg-card rounded-3xl p-6 shadow-card text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm bg-card rounded-3xl p-6 shadow-card text-center space-y-4">
          <p className="text-muted-foreground">Invalid or expired reset link.</p>
          <Button onClick={() => navigate("/forgot-password")} variant="outline" className="w-full">
            Request New Link
          </Button>
          <Button onClick={() => navigate("/auth")} variant="ghost" className="w-full">
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm bg-card rounded-3xl p-6 shadow-card animate-slide-up">
        {isSuccess ? (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-primary-foreground" />
            </div>
            <h2 className="font-display text-xl font-semibold text-foreground">Password Updated!</h2>
            <p className="text-sm text-muted-foreground">Redirecting to sign in...</p>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-8 h-8 text-primary-foreground" />
              </div>
              <h2 className="font-display text-xl font-semibold text-foreground">Set New Password</h2>
              <p className="text-sm text-muted-foreground mt-1">Choose a strong password for your account.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="New password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-12 h-12 rounded-xl bg-muted border-0 focus-visible:ring-primary"
                  />
                </div>
                {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
              </div>
              <div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-12 h-12 rounded-xl bg-muted border-0 focus-visible:ring-primary"
                  />
                </div>
                {errors.confirm && <p className="text-xs text-destructive mt-1">{errors.confirm}</p>}
              </div>
              <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <span className="animate-pulse">Updating...</span>
                ) : (
                  "Update Password"
                )}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
