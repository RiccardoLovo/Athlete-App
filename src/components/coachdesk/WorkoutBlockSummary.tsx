import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { summarizeIntervals } from "@/lib/coachdesk/prescription";
import {
  BLOCK_LABELS,
  blockIntensity,
  blockTarget,
} from "@/lib/coachdesk/blocks";
import { SessionProfile, SessionTotals } from "./SessionProfile";

type Block = {
  id: string;
  block_type: string;
  label: string | null;
  target_mode: string | null;
  target_unit: string | null;
  intensity_mode: string | null;
  distance_km: number | null;
  duration_min: number | null;
  pace: string | null;
  zone: number | null;
  pct_threshold: number | null;
  interval_count: number | null;
  rest_mode: "seconds" | "ratio" | null;
  rest_seconds: number | null;
  rest_ratio: number | null;
};

type Round = {
  workout_block_id: string | null;
  target_value: number | null;
  target_unit: string;
  rest_seconds: number | null;
  rest_mode: "seconds" | "ratio" | null;
  rest_ratio: number | null;
  // Needed to place a distance round on the time axis, and to colour it.
  pace_per_km: string | null;
  hr_zone: number | null;
};

/**
 * Read-only "finished workout" view of a structured Run/Swim/Bike
 * exercise — what the workout actually is, rather than the builder.
 * Used in the athlete's screens and in the coach's collapsed card.
 */
export function WorkoutBlockSummary({
  sessionExerciseId,
  discipline,
  chartOnly = false,
}: {
  sessionExerciseId: string;
  /** While logging, the blocks are listed beside their actuals instead, so
   *  only the shape is wanted here — the same list twice reads as a bug. */
  chartOnly?: boolean;
  /** Pace means seconds per km running and per 100 m swimming, so the
   *  session's shape cannot be worked out without knowing the sport. */
  discipline?: string | null;
}) {
  const { data: blocks = [] } = useQuery({
    queryKey: ["workout-blocks", sessionExerciseId],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_blocks")
        .select(
          "id, block_type, label, target_mode, target_unit, intensity_mode, distance_km, duration_min, pace, zone, pct_threshold, interval_count, rest_mode, rest_seconds, rest_ratio",
        )
        .eq("session_exercise_id", sessionExerciseId)
        .order("order_index");
      if (error) throw error;
      return (data ?? []) as Block[];
    },
  });

  const blockIds = blocks
    .filter((b) => b.block_type === "intervals" || b.block_type === "pyramid")
    .map((b) => b.id);

  const { data: rounds = [] } = useQuery({
    queryKey: ["workout-block-rounds", blockIds.join(",")],
    enabled: blockIds.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("prescription_intervals")
        .select(
          "workout_block_id, target_value, target_unit, rest_seconds, rest_mode, rest_ratio, pace_per_km, hr_zone",
        )
        .in("workout_block_id", blockIds)
        .order("order_index");
      return (data ?? []) as Round[];
    },
  });

  if (!blocks.length) return null;

  return (
    <div className="space-y-2 rounded border border-border bg-muted/30 p-2">
      <SessionProfile blocks={blocks} rounds={rounds} discipline={discipline} />
      {!chartOnly &&
        blocks.map((b) => {
          const mine = rounds.filter((r) => r.workout_block_id === b.id);
          const isRounds =
            b.block_type === "intervals" || b.block_type === "pyramid";
          const { primary, indicative } = blockIntensity(b);

          return (
            <div
              key={b.id}
              className="flex flex-wrap items-baseline gap-x-2 text-xs"
            >
              <span className="rounded border border-border px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {BLOCK_LABELS[b.block_type] ?? b.block_type}
              </span>
              {b.label && <span className="text-foreground">{b.label}</span>}
              <span className="text-foreground">
                {isRounds
                  ? mine.length
                    ? summarizeIntervals(
                        mine.map((r) => ({
                          target_value:
                            r.target_value == null
                              ? null
                              : Number(r.target_value),
                          target_unit: r.target_unit,
                          rest_mode: r.rest_mode,
                          rest_seconds: r.rest_seconds,
                          rest_ratio: r.rest_ratio,
                        })),
                      )
                    : "—"
                  : (blockTarget(b) ?? "—")}
              </span>
              {primary && <span className="font-medium">{primary}</span>}
              {indicative && (
                <span className="text-muted-foreground">~{indicative}</span>
              )}
            </div>
          );
        })}
      {!chartOnly && (
        <SessionTotals
          blocks={blocks}
          rounds={rounds}
          discipline={discipline}
          className="border-t border-border pt-2"
        />
      )}
    </div>
  );
}
