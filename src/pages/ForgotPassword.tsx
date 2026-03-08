import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Mail, ArrowLeft, Send } from "lucide-react";
import { z } from "zod";

const emailSchema = z.string().email("Please enter a valid email");

export const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    const result = emailSchema.safeParse(normalizedEmail);
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setEmail(normalizedEmail);
    setError(undefined);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setSent(true);
        toast({
          title: "Check your email 📬",
          description: "If an account exists for this email, a reset link has been sent.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm bg-card rounded-3xl p-6 shadow-card animate-slide-up">
        {sent ? (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mx-auto">
              <Mail className="w-8 h-8 text-primary-foreground" />
            </div>
            <h2 className="font-display text-xl font-semibold text-foreground">Check Your Email</h2>
            <p className="text-sm text-muted-foreground">
              We sent a password reset link to <strong className="text-foreground">{email}</strong>. 
              Click the link in the email to reset your password.
            </p>
            <Button variant="outline" onClick={() => navigate("/auth")} className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sign In
            </Button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-xl font-semibold text-foreground mb-2 text-center">
              Forgot Password?
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Enter your email and we'll send you a reset link.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-12 h-12 rounded-xl bg-muted border-0 focus-visible:ring-primary"
                  />
                </div>
                {error && <p className="text-xs text-destructive mt-1">{error}</p>}
              </div>
              <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <span className="animate-pulse">Sending...</span>
                ) : (
                  <>
                    Send Reset Link
                    <Send className="w-5 h-5" />
                  </>
                )}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => navigate("/auth")}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <ArrowLeft className="w-3 h-3 inline mr-1" />
                Back to Sign In
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
