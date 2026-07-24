import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: invite, isLoading } = useQuery({
    queryKey: ["invite", token],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_invite_info", { _token: token });
      const row = Array.isArray(data) ? data[0] : data;
      return row as {
        valid: boolean;
        used: boolean;
        client_name: string;
        coach_name: string;
      } | null;
    },
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          role: "athlete",
          invite_token: token,
          name: invite?.client_name ?? email.split("@")[0],
        },
      },
    });
    setLoading(false);
    if (error) {
      const msg = /weak|pwned/i.test(error.message)
        ? "This password appears in known data breaches. Please choose a stronger, unique password."
        : error.message;
      setFormError(msg);
      toast.error(msg);
      return;
    }
    toast.success("Welcome! You're signed in.");
    navigate({ to: "/dashboard", replace: true });
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading invite…
      </div>
    );
  }

  if (!invite || !invite.valid || invite.used) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="max-w-md p-8 text-center">
          <h1 className="text-xl font-bold">Invite unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {invite?.used
              ? "This invite has already been used."
              : "This invite link isn't valid. Ask your coach for a new one."}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted px-4">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-center text-2xl font-bold text-primary">
          Welcome to CoachDesk
        </h1>
        <p className="mb-1 mt-2 text-center text-sm">
          Coach <strong>{invite.coach_name}</strong> invited you
        </p>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Signing up as <strong>{invite.client_name}</strong>
        </p>
        {formError && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {formError}
          </div>
        )}
        <form onSubmit={signUp} className="space-y-4">
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
            <Label htmlFor="password">Choose a password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Use a strong, unique password (8+ characters).
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account…" : "Create athlete account"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
