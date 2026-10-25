import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { summarizeIntervals } from "@/lib/coachdesk/prescription";

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
};

type Round = {
  workout_block_id: string | null;
  target_value: number | null;
  target_unit: string;
  rest_seconds: number | null;
  rest_mode: "seconds" | "ratio" | null;
  rest_ratio: number | null;
};

const BLOCK_LABELS: Record<string, string> = {
  warmup: "Warm-up",
  cooldown: "Cool-down",
  steady: "Steady",
  drill: "Drill",
  intervals: "Intervals",
  pyramid: "Pyramid",
};

// The target as the coach entered it, in their chosen unit.
function targetText(b: Block): string | null {
  if (b.target_mode === "time") {
    if (b.duration_min == null) return null;
    return b.target_unit === "sec"
      ? `${Math.round(b.duration_min * 60)} sec`
      : `${b.duration_min} min`;
  }
  if (b.distance_km == null) return null;
  return b.target_unit === "m"
    ? `${Math.round(b.distance_km * 1000)} m`
    : `${b.distance_km} km`;
}

/**
 * Read-only "finished workout" view of a structured Run/Swim/Bike
 * exercise — what the workout actually is, rather than the builder.
 * Used in the athlete's screens and in the coach's collapsed card.
 */
export function WorkoutBlockSummary({
  sessionExerciseId,
}: {
  sessionExerciseId: string;
}) {
  const { data: blocks = [] } = useQuery({
    queryKey: ["workout-blocks", sessionExerciseId],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_blocks")
        .select(
          "id, block_type, label, target_mode, target_unit, intensity_mode, distance_km, duration_min, pace, zone, pct_threshold",
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
          "workout_block_id, target_value, target_unit, rest_seconds, rest_mode, rest_ratio",
        )
        .in("workout_block_id", blockIds)
        .order("order_index");
      return (data ?? []) as Round[];
    },
  });

  if (!blocks.length) return null;

  // Running totals across the whole workout, in whichever units apply.
  let totalKm = 0;
  let totalMin = 0;
  for (const b of blocks) {
    totalKm += b.distance_km ?? 0;
    totalMin += b.duration_min ?? 0;
  }
  for (const r of rounds) {
    if (r.target_value == null) continue;
    if (r.target_unit === "meters") totalKm += Number(r.target_value) / 1000;
    else if (r.target_unit === "seconds")
      totalMin += Number(r.target_value) / 60;
    else if (r.target_unit === "minutes") totalMin += Number(r.target_value);
  }

  return (
    <div className="space-y-1 rounded border border-border bg-muted/30 p-2">
      {blocks.map((b) => {
        const mine = rounds.filter((r) => r.workout_block_id === b.id);
        const isRounds =
          b.block_type === "intervals" || b.block_type === "pyramid";
        const zoneText = b.zone != null ? `Z${b.zone}` : null;
        const pctText = b.pct_threshold != null ? `${b.pct_threshold}%` : null;
        const followZone = b.intensity_mode !== "pace";
        const primary = followZone
          ? [zoneText, pctText].filter(Boolean).join(" ")
          : b.pace;
        const indicative = followZone
          ? b.pace
          : [zoneText, pctText].filter(Boolean).join(" ");

        return (
          <div
            key={b.id}
            className="flex flex-wrap items-baseline gap-x-2 text-xs"
          >
            <span className="min-w-[68px] font-medium">
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
                : (targetText(b) ?? "—")}
            </span>
            {primary && <span className="font-medium">{primary}</span>}
            {indicative && (
              <span className="text-muted-foreground">~{indicative}</span>
            )}
          </div>
        );
      })}
      {(totalKm > 0 || totalMin > 0) && (
        <div className="border-t border-border pt-1 text-[11px] text-muted-foreground">
          Total:{" "}
          {totalKm > 0 && (
            <span className="font-medium text-foreground">
              {Math.round(totalKm * 100) / 100}km
            </span>
          )}
          {totalKm > 0 && totalMin > 0 && " · "}
          {totalMin > 0 && (
            <span className="font-medium text-foreground">
              {Math.round(totalMin)} min
            </span>
          )}
        </div>
      )}
    </div>
  );
}
