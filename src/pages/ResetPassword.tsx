import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Lock, Check, Sparkles, Loader2, Mail, RefreshCw } from "lucide-react";
import { z } from "zod";

const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

export const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [status, setStatus] = useState<"loading" | "ready" | "expired" | "invalid">("loading");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const type = params.get("type");

    // Check for error in hash (Supabase redirects with #error=...&error_description=...)
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1));
      const error = hashParams.get("error");
      const errorDesc = hashParams.get("error_description");
      
      if (error) {
        console.log("Reset link error:", error, errorDesc);
        setStatus("expired");
        return () => { mounted = false; };
      }
    }

    // PKCE flow: exchange code for session
    if (code && type === "recovery") {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          console.error("Code exchange error:", error);
          setStatus("expired");
        } else if (data.session) {
          setStatus("ready");
        }
      });
      return () => { mounted = false; };
    }

    // Hash-based flow: listen for auth events
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

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        // Check if this is a recovery session by looking at aal
        setTimeout(() => {
          if (mounted) setStatus(prev => prev === "loading" ? "ready" : prev);
        }, 1000);
      } else {
        // No session, no valid hash, no code = link likely expired
        const hasToken = hash && (hash.includes("access_token") || hash.includes("type=recovery"));
        if (!hasToken) {
          setTimeout(() => {
            if (mounted) setStatus(prev => prev === "loading" ? "expired" : prev);
          }, 2500);
        }
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
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        setIsSuccess(true);
        toast({ title: "Password updated! 🎉", description: "You can now sign in with your new password." });
        await supabase.auth.signOut();
        setTimeout(() => navigate("/auth"), 2000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!resendEmail.trim()) {
      toast({ title: "Enter your email", variant: "destructive" });
      return;
    }
    setResending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resendEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        setResent(true);
        toast({ title: "Reset link sent! 📬", description: "Check your email for the new link." });
      }
    } finally {
      setResending(false);
    }
  };

  // Loading state
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

  // Expired / invalid link — show resend option
  if (status === "expired" || status === "invalid") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm bg-card rounded-3xl p-6 shadow-card text-center space-y-4 animate-slide-up">
          <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto">
            <RefreshCw className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="font-display text-xl font-semibold text-foreground">Link Expired</h2>
          <p className="text-sm text-muted-foreground">
            This reset link has expired or was already used. Email apps sometimes pre-open links which can cause this. Request a new one below.
          </p>

          {resent ? (
            <div className="space-y-3 pt-2">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Check your email for the new reset link. <strong>Click it quickly</strong> before any prefetcher does.
              </p>
              <Button variant="outline" onClick={() => navigate("/auth")} className="w-full">
                Back to Sign In
              </Button>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <Input
                type="email"
                placeholder="Enter your email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                className="h-12 rounded-xl bg-muted border-0 focus-visible:ring-primary"
              />
              <Button
                onClick={handleResend}
                disabled={resending || !resendEmail.trim()}
                variant="gradient"
                size="lg"
                className="w-full"
              >
                {resending ? <span className="animate-pulse">Sending...</span> : "Send New Reset Link"}
              </Button>
              <Button variant="ghost" onClick={() => navigate("/auth")} className="w-full text-sm">
                Back to Sign In
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Ready to reset
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
                {isLoading ? <span className="animate-pulse">Updating...</span> : "Update Password"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
