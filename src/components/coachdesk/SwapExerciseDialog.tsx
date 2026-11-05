import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExerciseVideoButton } from "@/components/coachdesk/ExerciseVideo";

export type SwapReason =
  | "equipment"
  | "space"
  | "harder"
  | "lumbar"
  | "knee"
  | "achilles"
  | "shoulder"
  | "elbow";

export type SwapChoice = {
  exerciseId: string;
  name: string;
  reason: SwapReason;
};

type Suggestion = {
  exercise_id: string;
  name: string;
  tier: string;
  same_text: string;
  changed_text: string;
  dose_text: string;
  video_url: string | null;
  equip_tier: string;
  skill_level: string;
};

// Phrased as the athlete would say it, not as the schema spells it.
const REASONS: { id: SwapReason; label: string; group: string }[] = [
  { id: "equipment", label: "Equipment is taken", group: "Can't do it here" },
  { id: "space", label: "Not enough space", group: "Can't do it here" },
  { id: "harder", label: "Too hard today", group: "Can't do it here" },
  { id: "lumbar", label: "Lower back", group: "Something hurts" },
  { id: "knee", label: "Knee", group: "Something hurts" },
  { id: "achilles", label: "Achilles or calf", group: "Something hurts" },
  { id: "shoulder", label: "Shoulder", group: "Something hurts" },
  { id: "elbow", label: "Elbow", group: "Something hurts" },
];

const TIER_STYLE: Record<string, string> = {
  curated: "border-primary/60 text-primary",
  "same movement": "border-sky-500/60 text-sky-500",
  "matched on axes": "border-border text-muted-foreground",
};

/**
 * Lets an athlete change an exercise mid-session and says what the change
 * costs. The prescription is never edited — the choice is recorded on the log
 * so the coach sees it at review.
 */
export function SwapExerciseDialog({
  open,
  onOpenChange,
  exerciseId,
  exerciseName,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseId: string;
  exerciseName: string;
  onChoose: (choice: SwapChoice) => void;
}) {
  const [reason, setReason] = useState<SwapReason | null>(null);

  const { data: suggestions, isFetching } = useQuery({
    queryKey: ["swap-suggestions", exerciseId, reason],
    enabled: open && !!reason,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("suggest_exercise_swaps", {
        _exercise_id: exerciseId,
        _reason: reason!,
      });
      if (error) throw error;
      return (data ?? []) as unknown as Suggestion[];
    },
  });

  function close(next: boolean) {
    if (!next) setReason(null);
    onOpenChange(next);
  }

  const groups = [...new Set(REASONS.map((r) => r.group))];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Swap {exerciseName}</DialogTitle>
          <DialogDescription>
            Your coach still sees the original plan — they'll see what you did
            instead and why.
          </DialogDescription>
        </DialogHeader>

        {groups.map((g) => (
          <div key={g} className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {g}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.filter((r) => r.group === g).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReason(r.id)}
                  aria-pressed={reason === r.id}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    reason === r.id
                      ? "border-foreground bg-foreground font-medium text-background"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        {reason && (
          <div className="space-y-2 border-t pt-3">
            {isFetching && (
              <p className="text-xs text-muted-foreground">Finding options…</p>
            )}

            {!isFetching && suggestions?.length === 0 && (
              <div className="rounded-md border border-dashed p-3">
                <p className="text-sm font-medium">No good substitute</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nothing here trains the same thing without making that worse.
                  Skip this exercise and tell your coach in the notes — that is
                  a better answer than a bad swap.
                </p>
              </div>
            )}

            {suggestions?.map((s) => (
              <div
                key={s.exercise_id}
                className="rounded-md border border-border p-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${
                      TIER_STYLE[s.tier] ?? TIER_STYLE["matched on axes"]
                    }`}
                  >
                    {s.tier === "curated" ? "coach's pick" : s.tier}
                  </span>
                  <ExerciseVideoButton
                    url={s.video_url}
                    name={s.name}
                    size="label"
                  />
                </div>
                <dl className="mt-1.5 space-y-0.5 text-[11px]">
                  <div className="flex gap-2">
                    <dt className="w-14 shrink-0 uppercase text-emerald-600">
                      same
                    </dt>
                    <dd className="text-muted-foreground">{s.same_text}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-14 shrink-0 uppercase text-amber-600">
                      changed
                    </dt>
                    <dd className="text-muted-foreground">{s.changed_text}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-14 shrink-0 uppercase text-muted-foreground">
                      sets
                    </dt>
                    <dd className="text-muted-foreground">{s.dose_text}</dd>
                  </div>
                </dl>
                <Button
                  size="sm"
                  className="mt-2 h-8 w-full"
                  onClick={() => {
                    onChoose({
                      exerciseId: s.exercise_id,
                      name: s.name,
                      reason: reason!,
                    });
                    close(false);
                  }}
                >
                  Do this instead
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The trigger that opens the dialog, for an exercise row. */
export function SwapButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground"
      title="Swap this exercise"
      aria-label="Swap this exercise"
      onClick={onClick}
    >
      <Repeat className="h-4 w-4" />
    </Button>
  );
}
