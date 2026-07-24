import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyRole } from "@/hooks/use-role";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CoachDesk — Training & feedback for elite coaches" },
      { name: "description", content: "Build training programmes, manage clients, and collect workout feedback in one workspace." },
    ],
  }),
  ssr: false,
  component: Index,
});

function Index() {
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.replace("/auth");
        return;
      }
      const role = await fetchMyRole();
      window.location.replace(role?.isAthlete ? "/dashboard" : "/exercises");
    })();
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      Loading CoachDesk…
    </div>
  );
}
