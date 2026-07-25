import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyRole } from "@/hooks/use-role";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CoachDesk — Training & feedback for elite coaches" },
      {
        name: "description",
        content:
          "Build training programmes, manage clients, and collect workout feedback in one workspace.",
      },
    ],
  }),
  ssr: false,
  component: Index,
});

function Index() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.replace("/auth");
        return;
      }
      const [role, { data: u }] = await Promise.all([
        fetchMyRole(),
        supabase.auth.getUser(),
      ]);
      if (role?.isAthlete) {
        window.location.replace("/dashboard");
        return;
      }
      const { data: coach } = await supabase
        .from("coaches")
        .select("name")
        .eq("id", u.user!.id)
        .maybeSingle();
      setName(coach?.name ?? u.user?.email?.split("@")[0] ?? null);
      // Brief welcome beat before landing on the clients workspace.
      window.setTimeout(() => window.location.replace("/clients"), 700);
    })();
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <h1 className="text-2xl font-bold text-primary">
        {name ? `Welcome back, ${name}` : "CoachDesk"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Taking you to your clients…
      </p>
    </div>
  );
}
