import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { fetchMyRole } from "@/hooks/use-role";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

// Reached via the link Supabase emails from resetPasswordForEmail(). The JS
// client auto-detects the recovery token in the URL and turns it into a
// real (temporary) session — we just wait for that, then let the user set
// a new password with updateUser(). No token handling needed here.
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // If the recovery session was already established before this effect
    // ran (e.g. fast redirect), the event above can be missed — check once.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (password !== confirm) {
      setFormError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      const msg = /weak|pwned/i.test(error.message)
        ? "This password appears in known data breaches. Please choose a stronger, unique password."
        : error.message;
      setFormError(msg);
      toast.error(msg);
      return;
    }
    toast.success("Password updated — you're signed in.");
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
          Reset your password
        </h1>
        {!ready ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Confirming your reset link…
          </p>
        ) : (
          <>
            {formError && (
              <div className="mb-4 mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {formError}
              </div>
            )}
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating…" : "Update password"}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
