import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, GripVertical, Trash2, Dumbbell, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  type Discipline, DISCIPLINE_ICON, summarizePrescription,
} from "@/lib/coachdesk/prescription";
import { PrescriptionForm, rowToPrescription } from "@/components/coachdesk/PrescriptionForm";
import { insertExerciseIntoSession, swapExerciseOrder } from "@/components/coachdesk/ExerciseBank";
import { toast } from "sonner";

type SE = {
  id: string; session_id: string; exercise_id: string; order_index: number;
  sets: number | null; reps: string;
  target_mode: string | null; rpe: number | null;
  load_mode: string | null; load_value: number | null;
  rest_sec: number | null;
  distance_km: number | null; duration_min: number | null;
  pace: string | null; hr_zone: number | null;
  tempo: string | null; notes: string | null;
  prescription: Record<string, unknown> | null;
  template_generated_at: string | null;
  exercises: {
    name_en: string;
    discipline: Discipline;
    stroke_default: string | null;
    structure_type: "simple" | "intervals" | "template";
    template_type: "rsa" | "pyramid" | null;
    template_defaults: Record<string, unknown> | null;
  };
};

export function SessionExercises({ sessionId, clientId, compact }: {
  sessionId: string; clientId?: string | null; compact?: boolean;
}) {
  const qc = useQueryClient();

  const { data: exs = [] } = useQuery({
    queryKey: ["session-exs", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("session_exercises")
        .select("*, exercises(name_en, discipline, stroke_default, structure_type, template_type, template_defaults)")
        .eq("session_id", sessionId)
        .order("order_index");
      return (data ?? []) as unknown as SE[];
    },
  });

  const { data: oneRms = [] } = useQuery({
    queryKey: ["one-rms", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_exercise_1rm")
        .select("exercise_id, value_kg, tested_date")
        .eq("client_id", clientId!)
        .order("tested_date", { ascending: false });
      return (data ?? []) as { exercise_id: string; value_kg: number; tested_date: string }[];
    },
  });

  const latestRmByEx = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of oneRms) if (!m.has(r.exercise_id)) m.set(r.exercise_id, Number(r.value_kg));
    return m;
  }, [oneRms]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["session-exs", sessionId] });
    qc.invalidateQueries({ queryKey: ["session-ex-count", sessionId] });
  }

  function bumpBlockCount(delta: number) {
    // Update every cached block-level count map that contains this session.
    const caches = qc.getQueriesData<Record<string, number>>({ queryKey: ["block-session-ex-counts"] });
    for (const [key, value] of caches) {
      if (!value || !(sessionId in value)) continue;
      qc.setQueryData<Record<string, number>>(key, {
        ...value,
        [sessionId]: Math.max(0, (value[sessionId] ?? 0) + delta),
      });
    }
  }

  async function handleDrop(ev: React.DragEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    const raw = ev.dataTransfer.getData("application/json") || ev.dataTransfer.getData("text/exercise-id") || ev.dataTransfer.getData("text/plain");
    if (!raw) return;
    let exerciseId: string | undefined;
    try {
      const obj = JSON.parse(raw);
      exerciseId = obj.exerciseId;
    } catch {
      exerciseId = raw;
    }
    if (!exerciseId) return;
    const { error } = await insertExerciseIntoSession(sessionId, exerciseId);
    if (error) return toast.error(error.message);
    bumpBlockCount(+1);
    invalidate();
  }

  return (
    <div
      className="space-y-2"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={handleDrop}
    >
      {exs.length === 0 ? (
        <div className={`rounded-md border border-dashed text-center text-xs text-muted-foreground ${compact ? "py-4" : "py-12"}`}>
          <Dumbbell className={`mx-auto mb-1 opacity-50 ${compact ? "h-4 w-4" : "h-6 w-6"}`} />
          Drag exercises here
        </div>
      ) : (
        exs.map((e, idx) => (
          <ExerciseCard
            key={e.id}
            se={e}
            defaultExpanded={!compact && idx === exs.length - 1 && exs.length <= 2}
            onChanged={invalidate}
            oneRmKg={latestRmByEx.get(e.exercise_id) ?? null}
            canMoveUp={idx > 0}
            canMoveDown={idx < exs.length - 1}
            onOptimisticRemove={(id) => {
              qc.setQueryData<SE[]>(["session-exs", sessionId], (prev) =>
                (prev ?? []).filter((row) => row.id !== id),
              );
              qc.setQueryData<number>(["session-ex-count", sessionId], (prev) =>
                typeof prev === "number" ? Math.max(0, prev - 1) : prev,
              );
              bumpBlockCount(-1);
            }}
            onMoveUp={async () => {
              const prev = exs[idx - 1];
              if (!prev) return;
              await swapExerciseOrder(
                { id: e.id, order_index: e.order_index },
                { id: prev.id, order_index: prev.order_index },
              );
              invalidate();
            }}
            onMoveDown={async () => {
              const next = exs[idx + 1];
              if (!next) return;
              await swapExerciseOrder(
                { id: e.id, order_index: e.order_index },
                { id: next.id, order_index: next.order_index },
              );
              invalidate();
            }}
          />
        ))
      )}
    </div>
  );
}

export function ExerciseCard({ se, defaultExpanded, onChanged, oneRmKg, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onOptimisticRemove }: {
  se: SE; defaultExpanded?: boolean; onChanged: () => void; oneRmKg: number | null;
  canMoveUp?: boolean; canMoveDown?: boolean;
  onMoveUp?: () => void; onMoveDown?: () => void;
  onOptimisticRemove?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const discipline = (se.exercises?.discipline ?? "Strength") as Discipline;
  const initial = useMemo(() => rowToPrescription(se as unknown as Record<string, unknown>), [se]);
  const summary = summarizePrescription(discipline, initial, oneRmKg);

  async function remove() {
    // Optimistic: drop from UI immediately so iPad/tap deletes feel instant.
    onOptimisticRemove?.(se.id);
    const { error } = await supabase.from("session_exercises").delete().eq("id", se.id);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      onChanged(); // rollback by refetching truth
    }
  }

  return (
    <div className="rounded border bg-card p-2 text-sm">
      <div className="flex items-center gap-2">
        <GripVertical className="h-3 w-3 text-muted-foreground" />
        <span title={discipline}>{DISCIPLINE_ICON[discipline]}</span>
        <span className="flex-1 truncate text-xs font-semibold">{se.exercises?.name_en}</span>
        <button
          onClick={onMoveUp}
          disabled={!canMoveUp}
          title="Move up"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={!canMoveDown}
          title="Move down"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <button onClick={remove}><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
      </div>
      {!expanded ? (
        <div className="mt-1 truncate text-[11px] text-muted-foreground">{summary || "—"}</div>
      ) : (
        <div className="mt-2">
          <PrescriptionForm
            rowId={se.id}
            discipline={discipline}
            initial={initial}
            oneRmKg={oneRmKg}
            strokeDefault={se.exercises?.stroke_default ?? null}
            onChanged={onChanged}
            structureType={se.exercises?.structure_type ?? "simple"}
            templateType={se.exercises?.template_type ?? null}
            templateDefaults={se.exercises?.template_defaults ?? null}
            templateGeneratedAt={se.template_generated_at ?? null}
          />
        </div>
      )}
    </div>
  );
}