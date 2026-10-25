import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Block = {
  id: string;
  block_type: string;
  label: string | null;
  target_mode: string | null;
  distance_km: number | null;
  duration_min: number | null;
  pace: string | null;
  zone: number | null;
  pct_threshold: number | null;
};

const BLOCK_LABELS: Record<string, string> = {
  warmup: "Warm-up",
  cooldown: "Cool-down",
  steady: "Steady",
  drill: "Drill",
  intervals: "Intervals",
  pyramid: "Pyramid",
};

function describeBlock(b: Block): string {
  const parts: string[] = [];
  if (b.target_mode === "distance" && b.distance_km != null)
    parts.push(`${b.distance_km}km`);
  else if (b.target_mode === "time" && b.duration_min != null)
    parts.push(`${b.duration_min} min`);
  if (b.pace) parts.push(`Pace ${b.pace}`);
  if (b.zone != null) parts.push(`Z${b.zone}`);
  if (b.pct_threshold != null) parts.push(`${b.pct_threshold}%`);
  return parts.join(" · ") || "—";
}

// Read-only block list for the athlete — the coach-side builder
// (WorkoutBlockBuilder) is where these are authored. Shown above the
// generic duration/distance/pace actual-logging fields, which still log
// the workout as a whole for now (per-block actual logging is a
// follow-up).
export function WorkoutBlockSummary({
  sessionExerciseId,
}: {
  sessionExerciseId: string;
}) {
  const { data: blocks = [] } = useQuery({
    queryKey: ["workout-blocks", sessionExerciseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_blocks")
        .select(
          "id, block_type, label, target_mode, distance_km, duration_min, pace, zone, pct_threshold",
        )
        .eq("session_exercise_id", sessionExerciseId)
        .order("order_index");
      if (error) throw error;
      return (data ?? []) as Block[];
    },
  });

  const { data: roundCounts = {} } = useQuery({
    queryKey: ["workout-block-round-counts", blocks.map((b) => b.id).join(",")],
    enabled: blocks.some(
      (b) => b.block_type === "intervals" || b.block_type === "pyramid",
    ),
    queryFn: async () => {
      const ids = blocks
        .filter(
          (b) => b.block_type === "intervals" || b.block_type === "pyramid",
        )
        .map((b) => b.id);
      if (!ids.length) return {};
      const { data } = await supabase
        .from("prescription_intervals")
        .select("workout_block_id")
        .in("workout_block_id", ids);
      const counts: Record<string, number> = {};
      for (const r of (data ?? []) as { workout_block_id: string | null }[]) {
        if (!r.workout_block_id) continue;
        counts[r.workout_block_id] = (counts[r.workout_block_id] ?? 0) + 1;
      }
      return counts;
    },
  });

  if (!blocks.length) return null;

  return (
    <div className="space-y-1 rounded border border-border bg-muted/30 p-2">
      {blocks.map((b) => (
        <div key={b.id} className="flex items-center gap-2 text-xs">
          <span className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
            {BLOCK_LABELS[b.block_type] ?? b.block_type}
          </span>
          {b.block_type === "drill" && b.label && (
            <span className="font-medium">{b.label}</span>
          )}
          <span className="text-muted-foreground">
            {b.block_type === "intervals" || b.block_type === "pyramid"
              ? `${roundCounts[b.id] ?? 0} rounds`
              : describeBlock(b)}
          </span>
        </div>
      ))}
    </div>
  );
}
