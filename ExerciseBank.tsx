import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BODY_REGIONS } from "@/lib/coachdesk/tags";
import {
  type Discipline, DISCIPLINES, DISCIPLINE_BADGE, DISCIPLINE_ICON,
} from "@/lib/coachdesk/prescription";
import { t } from "@/lib/coachdesk/i18n";

type Exercise = {
  id: string; name_en: string; name_it: string; discipline: Discipline;
  category: string; body_region: string | null; stroke_default: string | null;
};

export function ExerciseBank({ className, selectedExerciseId, onSelectExercise }: {
  className?: string;
  selectedExerciseId?: string | null;
  onSelectExercise?: (exercise: { id: string; name: string }) => void;
}) {
  const [search, setSearch] = useState("");
  const [filterDisciplines, setFilterDisciplines] = useState<Set<Discipline>>(new Set());
  const [filterRegions, setFilterRegions] = useState<Set<string>>(new Set());

  const { data: bank = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data } = await supabase
        .from("exercises")
        .select("id, name_en, name_it, discipline, category, body_region, stroke_default")
        .order("name_en");
      return (data ?? []) as unknown as Exercise[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return bank.filter((e) => {
      if (q && !e.name_en.toLowerCase().includes(q) && !e.name_it.toLowerCase().includes(q)) return false;
      if (filterDisciplines.size > 0 && !filterDisciplines.has(e.discipline)) return false;
      if (filterRegions.size > 0 && !(e.body_region && filterRegions.has(e.body_region))) return false;
      return true;
    });
  }, [bank, search, filterDisciplines, filterRegions]);

  return (
    <aside className={`w-[320px] shrink-0 overflow-auto border-r bg-muted/30 p-3 ${className ?? ""}`}>
      <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Tap or drag to add</div>
      <div className="mb-2 rounded border border-dashed border-primary/40 bg-primary/5 p-2 text-[10px] text-muted-foreground">
        <b>On iPad/touch:</b> tap an exercise below to select it, then tap a day to add it there.
      </div>
      <Input placeholder="Search…" className="mb-2 h-8" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="mb-2 flex flex-wrap gap-1">
        <span className="text-[10px] font-medium text-muted-foreground">{t("builder.filter.discipline")}:</span>
        {DISCIPLINES.map((d) => {
          const active = filterDisciplines.has(d);
          return (
            <button key={d} onClick={() => {
              const next = new Set(filterDisciplines);
              if (active) next.delete(d); else next.add(d);
              setFilterDisciplines(next);
            }}
              className={`rounded-full border px-1.5 py-0.5 text-[10px] ${active ? DISCIPLINE_BADGE[d] : "border-border text-muted-foreground hover:text-foreground"}`}>
              {DISCIPLINE_ICON[d]} {d}
            </button>
          );
        })}
        {filterDisciplines.size > 0 && (
          <button onClick={() => setFilterDisciplines(new Set())} className="text-[10px] text-muted-foreground hover:text-foreground">
            <X className="inline h-3 w-3" />
          </button>
        )}
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        <span className="text-[10px] font-medium text-muted-foreground">Body region:</span>
        {BODY_REGIONS.map((r) => {
          const active = filterRegions.has(r.key);
          return (
            <button key={r.key} onClick={() => {
              const next = new Set(filterRegions);
              if (active) next.delete(r.key); else next.add(r.key);
              setFilterRegions(next);
            }}
              className={`rounded-full border px-1.5 py-0.5 text-[10px] ${active ? "bg-secondary text-secondary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {r.label}
            </button>
          );
        })}
        {filterRegions.size > 0 && (
          <button onClick={() => setFilterRegions(new Set())} className="text-[10px] text-muted-foreground hover:text-foreground">
            <X className="inline h-3 w-3" />
          </button>
        )}
      </div>
      <div className="space-y-1">
        {filtered.map((e) => (
          <div
            key={e.id}
            draggable
            onClick={() => onSelectExercise?.({ id: e.id, name: e.name_en })}
            onDragStart={(ev) => {
              ev.dataTransfer.effectAllowed = "copy";
              ev.dataTransfer.setData("application/json", JSON.stringify({ exerciseId: e.id }));
              ev.dataTransfer.setData("text/exercise-id", e.id);
              ev.dataTransfer.setData("text/plain", e.id);
            }}
            className={`cursor-grab rounded border bg-card p-2 text-xs hover:border-primary ${selectedExerciseId === e.id ? "border-primary ring-1 ring-primary" : ""}`}
          >
            <div className="font-semibold">{e.name_en}</div>
            <div className="mt-1 flex gap-1">
              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${DISCIPLINE_BADGE[e.discipline] ?? ""}`}>
                {DISCIPLINE_ICON[e.discipline] ?? ""} {e.discipline}
              </span>
              {e.body_region && <Badge variant="outline" className="text-[10px]">{e.body_region}</Badge>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{filtered.length} exercises</div>
    </aside>
  );
}

export async function insertExerciseIntoSession(sessionId: string, exerciseId: string) {
  const { data: ex } = await supabase
    .from("exercises").select("discipline, stroke_default").eq("id", exerciseId).single();
  const { defaultForDiscipline } = await import("@/lib/coachdesk/prescription");
  const discipline = (ex?.discipline ?? "Strength") as Discipline;
  const defaults = defaultForDiscipline(discipline);
  const jsonExtras: Record<string, unknown> = {};
  if (discipline === "Swimming" && ex?.stroke_default) jsonExtras.stroke = ex.stroke_default;
  // Always append to the end: take max(order_index) + 1, not row count
  // (count breaks if rows were deleted, causing duplicate order_index values).
  const { data: last } = await supabase
    .from("session_exercises")
    .select("order_index")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIndex = ((last?.order_index ?? -1) as number) + 1;
  const result = await supabase.from("session_exercises").insert({
    session_id: sessionId, exercise_id: exerciseId, order_index: nextIndex,
    sets: defaults.sets ?? null, reps: defaults.reps ?? "",
    target_mode: defaults.target_mode ?? null,
    load_mode: defaults.load_mode ?? null,
    rest_sec: defaults.rest_sec ?? null,
    prescription: jsonExtras as never,
  } as never);
  return result;
}

/**
 * Swap order_index of two session_exercises rows. Touch-friendly reorder
 * for iPad/mobile where HTML5 drag-and-drop does not fire from touch.
 */
export async function swapExerciseOrder(
  a: { id: string; order_index: number },
  b: { id: string; order_index: number },
) {
  // If indexes collide (legacy data), force a delta first.
  if (a.order_index === b.order_index) {
    await supabase.from("session_exercises").update({ order_index: b.order_index + 1 } as never).eq("id", b.id);
    b.order_index = b.order_index + 1;
  }
  await supabase.from("session_exercises").update({ order_index: b.order_index } as never).eq("id", a.id);
  await supabase.from("session_exercises").update({ order_index: a.order_index } as never).eq("id", b.id);
}