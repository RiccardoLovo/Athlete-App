import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  BLOCK_LABELS,
  blockHasRounds,
  blockIntensity,
  blockTarget,
  type BlockLike,
} from "@/lib/coachdesk/blocks";

export type BlockActual = {
  distanceKm: number | null;
  durationMin: number | null;
};

type Block = BlockLike & { id: string; order_index: number };

/**
 * What the athlete actually did, block by block. One total per session could
 * not say how much of it was Z2 — the zone lives on the block, so without
 * this there is no actual time-in-zone, only prescribed.
 *
 * Values are entered in whatever unit the block was prescribed in and stored
 * canonically in km and minutes, matching the block itself.
 */
export function BlockLogInputs({
  sessionExerciseId,
  values,
  onChange,
}: {
  sessionExerciseId: string;
  values: Record<string, BlockActual>;
  onChange: (blockId: string, next: BlockActual) => void;
}) {
  const { data: blocks = [] } = useQuery({
    queryKey: ["workout-blocks", sessionExerciseId],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_blocks")
        .select(
          "id, order_index, block_type, label, target_mode, target_unit, intensity_mode, distance_km, duration_min, pace, zone, pct_threshold",
        )
        .eq("session_exercise_id", sessionExerciseId)
        .order("order_index");
      if (error) throw error;
      return (data ?? []) as unknown as Block[];
    },
  });

  if (!blocks.length) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        What you actually did
      </p>
      {blocks.map((b) => {
        const isTime = b.target_mode === "time";
        const unit = b.target_unit ?? (isTime ? "min" : "km");
        const v = values[b.id] ?? { distanceKm: null, durationMin: null };
        // Shown in the block's own unit; km and minutes are what we store.
        const shown = isTime
          ? v.durationMin == null
            ? ""
            : unit === "sec"
              ? String(Math.round(v.durationMin * 60))
              : String(v.durationMin)
          : v.distanceKm == null
            ? ""
            : unit === "m"
              ? String(Math.round(v.distanceKm * 1000))
              : String(v.distanceKm);
        const { primary } = blockIntensity(b);
        const planned = blockHasRounds(b.block_type)
          ? [BLOCK_LABELS[b.block_type] ?? b.block_type, primary]
              .filter(Boolean)
              .join(" · ")
          : [
              BLOCK_LABELS[b.block_type] ?? b.block_type,
              blockTarget(b),
              primary,
            ]
              .filter(Boolean)
              .join(" · ");

        return (
          <div
            key={b.id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5"
          >
            <span className="min-w-0 flex-1 truncate text-xs">{planned}</span>
            <Input
              type="number"
              inputMode="decimal"
              className="h-9 w-24 text-base"
              placeholder={unit}
              value={shown}
              onChange={(ev) => {
                const raw = ev.target.value;
                const n = raw === "" ? null : Number(raw);
                if (n != null && !Number.isFinite(n)) return;
                onChange(
                  b.id,
                  isTime
                    ? {
                        distanceKm: null,
                        durationMin:
                          n == null ? null : unit === "sec" ? n / 60 : n,
                      }
                    : {
                        durationMin: null,
                        distanceKm:
                          n == null ? null : unit === "m" ? n / 1000 : n,
                      },
                );
              }}
            />
            <span className="w-8 shrink-0 text-xs text-muted-foreground">
              {unit}
            </span>
          </div>
        );
      })}
    </div>
  );
}
