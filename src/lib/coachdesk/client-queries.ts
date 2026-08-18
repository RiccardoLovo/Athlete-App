import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ClientPlan = {
  id: string;
  name: string;
  start_date: string;
  status: "draft" | "active" | "completed";
  training_blocks: { weeks: number; position: number }[];
};

export type ClientWithPlans = {
  id: string;
  name: string;
  sport: string;
  goal: string;
  coach_id: string;
  training_plans: ClientPlan[];
};

// Shared between the client detail page's own load and the clients list's
// hover-prefetch, so both hit the exact same cache entry — one embedded
// PostgREST call instead of two separate round trips (client + plans),
// which matters because each request here has a fixed ~700-900ms floor
// regardless of payload size.
export function clientWithPlansQuery(clientId: string) {
  return queryOptions({
    queryKey: ["client-with-plans", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select(
          "id, name, sport, goal, coach_id, training_plans(id, name, start_date, status, training_blocks(weeks, position))",
        )
        .eq("id", clientId)
        .order("start_date", {
          ascending: false,
          referencedTable: "training_plans",
        })
        .single();
      return data as unknown as ClientWithPlans | null;
    },
  });
}
