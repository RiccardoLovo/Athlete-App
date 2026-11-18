import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { useRole } from "@/hooks/use-role";
import { ThresholdFields } from "@/components/coachdesk/ThresholdDialog";
import { HrZonesEditor } from "@/components/coachdesk/HrZonesEditor";
import { BodyStats } from "@/features/stats/BodyStats";
import { OneRmSection } from "@/features/stats/OneRmSection";

export const Route = createFileRoute("/_authenticated/my-stats")({
  component: MyStatsPage,
});

/**
 * Everything the athlete knows about themselves, in one place.
 *
 * These numbers used to live in three: height and weight behind a profile
 * dialog, 1RMs on their own page, and the endurance thresholds on the
 * coach's screen where the athlete could not reach them at all — despite
 * being the one with the watch and the test results. They are one idea,
 * so they are one page.
 */
function MyStatsPage() {
  const navigate = useNavigate();
  const { data: role, isLoading: roleLoading } = useRole();

  const { data: client, isLoading } = useQuery({
    queryKey: ["my-client-stats"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("clients")
        .select("id, name, height_cm, coach_id")
        .eq("user_id", u.user.id)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!roleLoading && role && !role.hasClientProfile && !role.isAthlete)
      navigate({ to: "/clients", replace: true });
  }, [role, roleLoading, navigate]);

  if (isLoading) return null;

  if (!client)
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <Card className="p-8 text-center text-muted-foreground">
          No athlete profile is linked to this account yet.
        </Card>
      </div>
    );

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-auto">
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold">My stats</h1>
          <p className="text-sm text-muted-foreground">
            Your own numbers. Your coach can see them and prescribes against
            them, so keeping them current is what makes the paces and zones in
            your sessions mean anything.
          </p>
        </div>

        <section className="space-y-2">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Body
          </h2>
          <BodyStats
            clientId={client.id}
            coachId={client.coach_id}
            heightCm={client.height_cm}
          />
        </section>

        <section className="space-y-2">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Heart-rate zones
          </h2>
          <HrZonesEditor clientId={client.id} />
        </section>

        <section className="space-y-2">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Endurance thresholds
          </h2>
          <ThresholdFields clientId={client.id} />
        </section>

        <section className="space-y-2">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Strength
          </h2>
          <OneRmSection clientId={client.id} />
        </section>
      </div>
    </div>
  );
}
