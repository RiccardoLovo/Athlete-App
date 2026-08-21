import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { fetchMyRole } from "@/hooks/use-role";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const role = await fetchMyRole();
      navigate({
        to: role?.isAthlete ? "/dashboard" : "/exercises",
        replace: true,
      });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setLoading(false);
      const msg = /invalid login credentials/i.test(error.message)
        ? "Email or password is incorrect. If you've never signed up on this app, use the Coach sign up tab to create your account first — your account will then be remembered next time."
        : error.message;
      setFormError(msg);
      toast.error(msg);
      return;
    }
    // Wait for session to be persisted before navigating
    await supabase.auth.getSession();
    setLoading(false);
    const role = await fetchMyRole();
    navigate({
      to: role?.isAthlete ? "/dashboard" : "/clients",
      replace: true,
    });
  }

  async function sendResetEmail(e: React.FormEvent) {
    e.preventDefault();
    setResetSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setResetSent(true);
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { name: name || email.split("@")[0], role: "coach" },
      },
    });
    setLoading(false);
    if (error) {
      const msg = /weak|pwned/i.test(error.message)
        ? "This password appears in known data breaches. Please choose a stronger, unique password — a passphrase works well."
        : error.message;
      setFormError(msg);
      toast.error(msg);
      return;
    }
    // Wait for session to be persisted before navigating
    await supabase.auth.getSession();
    toast.success(
      "Account created. You're signed in — we'll remember you next time.",
    );
    const role = await fetchMyRole();
    navigate({
      to: role?.isAthlete ? "/dashboard" : "/clients",
      replace: true,
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted px-4">
      <Card className="w-full min-w-0 max-w-md p-8">
        <h1 className="text-center text-2xl font-bold text-primary">
          CoachDesk
        </h1>
        <p className="mb-6 mt-1 text-center text-sm text-muted-foreground">
          Coach sign-in. Athletes — open the invite link your coach sent.
        </p>
        {formError && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {formError}
          </div>
        )}
        <Tabs defaultValue="signin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Coach sign up</TabsTrigger>
          </TabsList>
          <TabsContent value="signin">
            {showReset ? (
              resetSent ? (
                <div className="space-y-4 pt-4">
                  <p className="text-sm text-muted-foreground">
                    If an account exists for <strong>{resetEmail}</strong>,
                    we've sent a password reset link. Check your inbox (and spam
                    folder).
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setShowReset(false);
                      setResetSent(false);
                    }}
                  >
                    Back to sign in
                  </Button>
                </div>
              ) : (
                <form onSubmit={sendResetEmail} className="space-y-4 pt-4">
                  <p className="text-sm text-muted-foreground">
                    Enter your email and we'll send you a link to reset your
                    password.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={resetSending}
                  >
                    {resetSending ? "Sending…" : "Send reset link"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setShowReset(false)}
                  >
                    Back to sign in
                  </Button>
                </form>
              )
            ) : (
              <form onSubmit={signIn} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      onClick={() => {
                        setResetEmail(email);
                        setShowReset(true);
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            )}
          </TabsContent>
          <TabsContent value="signup">
            <form onSubmit={signUp} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email2">Email</Label>
                <Input
                  id="email2"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password2">Password</Label>
                <Input
                  id="password2"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use a strong, unique password. Passwords found in known
                  breaches (like "Ricky97") are rejected.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating account…" : "Create coach account"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Athletes don't sign up here — your coach sends you a personal
                invite link.
              </p>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
