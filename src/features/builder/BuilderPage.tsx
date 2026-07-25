import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Dumbbell,
  GripVertical,
  Trash2,
  ChevronDown,
  ChevronRight,
  Tag,
  X,
  Plus,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import {
  TRAINING_CATEGORIES,
  BODY_REGIONS,
  trainingCategoryMeta,
  bodyRegionLabel,
  BODY_REGION_BADGE,
  type TrainingCategoryKey,
  type BodyRegionKey,
} from "@/lib/coachdesk/tags";
import {
  type Discipline,
  DISCIPLINES,
  DISCIPLINE_BADGE,
  DISCIPLINE_ICON,
  defaultForDiscipline,
  summarizePrescription,
} from "@/lib/coachdesk/prescription";
import {
  PrescriptionForm,
  rowToPrescription,
} from "@/components/coachdesk/PrescriptionForm";
import { swapExerciseOrder } from "@/components/coachdesk/ExerciseBank";
import { t } from "@/lib/coachdesk/i18n";
import {
  DAYS_OF_WEEK,
  DAYS_OF_WEEK_LONG,
  parseISODate,
  addDays,
  formatLong,
  blockStart,
} from "@/lib/coachdesk/periodization";

type Exercise = {
  id: string;
  name_en: string;
  name_it: string;
  discipline: Discipline;
  category: string;
  body_region: string | null;
  stroke_default: string | null;
};
type SE = {
  id: string;
  session_id: string;
  exercise_id: string;
  order_index: number;
  sets: number | null;
  reps: string;
  target_mode: string | null;
  rpe: number | null;
  load_mode: string | null;
  load_value: number | null;
  rest_sec: number | null;
  distance_km: number | null;
  duration_min: number | null;
  pace: string | null;
  hr_zone: number | null;
  tempo: string | null;
  notes: string | null;
  prescription: Record<string, unknown> | null;
  exercises: {
    name_en: string;
    discipline: Discipline;
    stroke_default: string | null;
  };
};

export function BuilderPage() {
  const { sessionId } = useParams({
    from: "/_authenticated/builder/$sessionId",
  });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [bankSearch, setBankSearch] = useState("");
  const [filterDisciplines, setFilterDisciplines] = useState<Set<Discipline>>(
    new Set(),
  );
  const [filterRegions, setFilterRegions] = useState<Set<string>>(new Set());
  const [showBank, setShowBank] = useState(true);
  const sessionNameInputRef = useRef<HTMLInputElement | null>(null);

  const { data: ctx } = useQuery({
    queryKey: ["session-ctx", sessionId],
    queryFn: async () => {
      const { data: s } = await supabase
        .from("sessions")
        .select(
          "id, name, notes, day_of_week, week_number, status, is_optional, training_category_tags, body_region, block_id, training_blocks(id, name, plan_id, weeks, position, training_plans(id, name, start_date, athlete_id, clients(id, name, sport, goal, coach_id)))",
        )
        .eq("id", sessionId)
        .single();
      return s as any;
    },
  });

  const planStart = ctx?.training_blocks?.training_plans?.start_date as
    | string
    | undefined;
  const planId = ctx?.training_blocks?.training_plans?.id as string | undefined;
  const blockId = ctx?.training_blocks?.id as string | undefined;
  const planName = ctx?.training_blocks?.training_plans?.name as
    | string
    | undefined;
  const blockName = ctx?.training_blocks?.name as string | undefined;
  const client = ctx?.training_blocks?.training_plans?.clients as
    | {
        id: string;
        name: string;
        sport: string;
        goal: string;
        coach_id: string;
      }
    | undefined;

  const { data: siblingBlocks = [] } = useQuery({
    queryKey: ["plan-blocks", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data } = await supabase
        .from("training_blocks")
        .select("position, weeks")
        .eq("plan_id", planId!);
      return (data ?? []) as { position: number; weeks: number }[];
    },
  });

  const sessionDate = useMemo(() => {
    if (!planStart || !ctx?.training_blocks) return null;
    const bStart = blockStart(
      planStart,
      siblingBlocks,
      ctx.training_blocks.position,
    );
    return addDays(bStart, (ctx.week_number - 1) * 7 + (ctx.day_of_week - 1));
  }, [planStart, siblingBlocks, ctx]);

  const { data: exs = [] } = useQuery({
    queryKey: ["session-exs", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("session_exercises")
        .select("*, exercises(name_en, discipline, stroke_default)")
        .eq("session_id", sessionId)
        .order("order_index");
      return (data ?? []) as unknown as SE[];
    },
  });

  const { data: oneRms = [] } = useQuery({
    queryKey: ["one-rms", client?.id],
    enabled: !!client,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_exercise_1rm")
        .select("exercise_id, value_kg, tested_date")
        .eq("client_id", client!.id)
        .order("tested_date", { ascending: false });
      return (data ?? []) as {
        exercise_id: string;
        value_kg: number;
        tested_date: string;
      }[];
    },
  });

  const latestRmByEx = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of oneRms)
      if (!m.has(r.exercise_id)) m.set(r.exercise_id, Number(r.value_kg));
    return m;
  }, [oneRms]);

  const { data: bank = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data } = await supabase
        .from("exercises")
        .select(
          "id, name_en, name_it, discipline, category, body_region, stroke_default",
        )
        .order("name_en");
      return (data ?? []) as unknown as Exercise[];
    },
  });

  const filteredBank = useMemo(() => {
    const q = bankSearch.toLowerCase();
    return bank.filter((e) => {
      if (
        q &&
        !e.name_en.toLowerCase().includes(q) &&
        !e.name_it.toLowerCase().includes(q)
      )
        return false;
      if (filterDisciplines.size > 0 && !filterDisciplines.has(e.discipline))
        return false;
      if (
        filterRegions.size > 0 &&
        !(e.body_region && filterRegions.has(e.body_region))
      )
        return false;
      return true;
    });
  }, [bank, bankSearch, filterDisciplines, filterRegions]);

  // Sibling sessions in the same block, for the week/day switcher.
  const { data: blockSessions = [] } = useQuery({
    queryKey: ["block-sessions", blockId],
    enabled: !!blockId,
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select("id, week_number, day_of_week, name")
        .eq("block_id", blockId!)
        .order("week_number")
        .order("day_of_week");
      return (data ?? []) as {
        id: string;
        week_number: number;
        day_of_week: number;
        name: string | null;
      }[];
    },
  });

  const totalWeeks: number = ctx?.training_blocks?.weeks ?? 0;

  async function jumpToDay(week: number, day: number) {
    const existing = blockSessions.find(
      (s) => s.week_number === week && s.day_of_week === day,
    );
    if (existing) {
      navigate({
        to: "/builder/$sessionId",
        params: { sessionId: existing.id },
      });
      return;
    }
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        block_id: blockId!,
        week_number: week,
        day_of_week: day,
        status: "active",
      } as never)
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    if (data)
      navigate({ to: "/builder/$sessionId", params: { sessionId: data.id } });
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["session-exs", sessionId] });
    qc.invalidateQueries({ queryKey: ["session-ctx", sessionId] });
  }

  async function onDropExercise(exerciseId: string) {
    const ex = bank.find((b) => b.id === exerciseId);
    const discipline: Discipline = (ex?.discipline ?? "Strength") as Discipline;
    const defaults = defaultForDiscipline(discipline);
    const jsonExtras: Record<string, unknown> = {};
    if (discipline === "Swimming" && ex?.stroke_default)
      jsonExtras.stroke = ex.stroke_default;
    // Append to end using max(order_index)+1 so deletions don't cause collisions.
    const lastIndex =
      exs.length === 0 ? -1 : Math.max(...exs.map((s) => s.order_index));
    const { error } = await supabase.from("session_exercises").insert({
      session_id: sessionId,
      exercise_id: exerciseId,
      order_index: lastIndex + 1,
      sets: defaults.sets ?? null,
      reps: defaults.reps ?? "",
      target_mode: defaults.target_mode ?? null,
      load_mode: defaults.load_mode ?? null,
      rest_sec: defaults.rest_sec ?? null,
      prescription: jsonExtras as never,
    } as never);
    if (error) return toast.error(error.message);
    invalidate();
  }

  async function moveExercise(idx: number, dir: -1 | 1) {
    const a = exs[idx];
    const b = exs[idx + dir];
    if (!a || !b) return;
    await swapExerciseOrder(
      { id: a.id, order_index: a.order_index },
      { id: b.id, order_index: b.order_index },
    );
    invalidate();
  }

  async function updateSessionName(name: string) {
    const { error } = await supabase
      .from("sessions")
      .update({ name })
      .eq("id", sessionId);
    if (error) return toast.error(`Save failed: ${error.message}`);
    invalidate();
  }
  async function toggleTag(key: TrainingCategoryKey) {
    const tags = (ctx?.training_category_tags ?? []) as string[];
    const next = tags.includes(key)
      ? tags.filter((t) => t !== key)
      : [...tags, key];
    const { error } = await supabase
      .from("sessions")
      .update({ training_category_tags: next })
      .eq("id", sessionId);
    if (error) return toast.error(`Save failed: ${error.message}`);
    invalidate();
  }
  async function setRegion(key: BodyRegionKey | null) {
    const { error } = await supabase
      .from("sessions")
      .update({ body_region: key })
      .eq("id", sessionId);
    if (error) return toast.error(`Save failed: ${error.message}`);
    invalidate();
  }
  // Optional sessions still appear for the athlete, but skipping one doesn't
  // count against them in the coach's on-track calculation.
  async function toggleOptional() {
    const { error } = await supabase
      .from("sessions")
      .update({ is_optional: !ctx?.is_optional })
      .eq("id", sessionId);
    if (error) return toast.error(`Save failed: ${error.message}`);
    invalidate();
  }

  useEffect(() => {
    function flushSessionName() {
      const value = sessionNameInputRef.current?.value;
      if (value == null || value === (ctx?.name ?? "")) return;
      void supabase
        .from("sessions")
        .update({ name: value })
        .eq("id", sessionId);
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") flushSessionName();
    }
    window.addEventListener("pagehide", flushSessionName);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushSessionName);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flushSessionName();
    };
  }, [ctx?.name, sessionId]);

  if (!ctx) return <div className="p-6 text-muted-foreground">Loading…</div>;
  const tags = (ctx.training_category_tags ?? []) as string[];
  const region = ctx.body_region as string | null;
  const dayLabel = DAYS_OF_WEEK_LONG[(ctx.day_of_week - 1) as 0];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="border-b bg-card px-4 py-3">
        <nav className="text-xs text-muted-foreground">
          {client && (
            <Link
              to="/clients/$clientId"
              params={{ clientId: client.id }}
              className="hover:text-foreground"
            >
              {client.name}
            </Link>
          )}
          <span> / </span>
          {planId && (
            <Link
              to="/plans/$planId"
              params={{ planId }}
              className="hover:text-foreground"
            >
              {planName}
            </Link>
          )}
          <span> / </span>
          {planId && blockId && (
            <Link
              to="/plans/$planId/blocks/$blockId"
              params={{ planId, blockId }}
              className="hover:text-foreground"
            >
              {blockName}
            </Link>
          )}
          <span>
            {" "}
            / Week {ctx.week_number} · {dayLabel}
          </span>
        </nav>
        <div className="mt-2 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              navigate({
                to: "/plans/$planId/blocks/$blockId",
                params: { planId: planId!, blockId: blockId! },
              })
            }
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <Input
              ref={sessionNameInputRef}
              defaultValue={ctx.name ?? ""}
              placeholder={dayLabel}
              className="h-9 max-w-md text-lg font-bold"
              onBlur={(e) => updateSessionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            {sessionDate && (
              <div className="text-xs text-muted-foreground">
                {formatLong(sessionDate)}
              </div>
            )}
          </div>
          <Button variant="outline" onClick={() => setShowBank((v) => !v)}>
            {showBank ? "Hide" : "Show"} Bank
          </Button>
        </div>
        {blockId && totalWeeks > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
              Week
            </span>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => (
                <button
                  key={w}
                  onClick={() => jumpToDay(w, ctx.day_of_week)}
                  className={`rounded-md border px-2 py-0.5 text-[11px] ${w === ctx.week_number ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {w}
                </button>
              ))}
            </div>
            <span className="ml-2 text-[10px] font-semibold uppercase text-muted-foreground">
              Day
            </span>
            <div className="flex flex-wrap gap-1">
              {DAYS_OF_WEEK.map((lbl, i) => {
                const d = i + 1;
                const hasSession = blockSessions.some(
                  (s) =>
                    s.week_number === ctx.week_number && s.day_of_week === d,
                );
                const isCurrent = d === ctx.day_of_week;
                return (
                  <button
                    key={d}
                    onClick={() => jumpToDay(ctx.week_number, d)}
                    className={`flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[11px] ${isCurrent ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  >
                    {lbl}
                    {!hasSession && !isCurrent && (
                      <Plus className="h-2.5 w-2.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags.map((tg) => {
            const meta = trainingCategoryMeta(tg);
            if (!meta) return null;
            return (
              <span
                key={tg}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${meta.className}`}
              >
                {meta.label}
              </span>
            );
          })}
          {region && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] ${BODY_REGION_BADGE}`}
            >
              {bodyRegionLabel(region)}
            </span>
          )}
          {ctx.is_optional && (
            <span className="rounded-full border border-yellow-300 bg-yellow-100 px-2 py-0.5 text-[11px] text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300">
              Optional
            </span>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:text-primary">
                <Tag className="h-2.5 w-2.5" /> Tag
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-3">
              <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Training category
              </div>
              <div className="mb-3 flex flex-wrap gap-1">
                {TRAINING_CATEGORIES.map((c) => {
                  const active = tags.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      onClick={() => toggleTag(c.key)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${active ? c.className : "border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Body region
              </div>
              <div className="flex flex-wrap gap-1">
                {BODY_REGIONS.map((r) => {
                  const active = region === r.key;
                  return (
                    <button
                      key={r.key}
                      onClick={() => setRegion(active ? null : r.key)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${active ? BODY_REGION_BADGE : "border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
              <div className="mb-1 mt-3 text-[10px] font-semibold uppercase text-muted-foreground">
                Attendance
              </div>
              <button
                onClick={() => toggleOptional()}
                className={`rounded-full border px-2 py-0.5 text-[10px] ${ctx.is_optional ? "border-yellow-300 bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                Optional
              </button>
              <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                Optional sessions don't count as missed feedback.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {showBank && (
          <aside className="w-[240px] shrink-0 overflow-auto border-r bg-muted/30 p-3">
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Drag to add
            </div>
            <Input
              placeholder="Search…"
              className="mb-2 h-8"
              value={bankSearch}
              onChange={(e) => setBankSearch(e.target.value)}
            />
            <div className="mb-2 flex flex-wrap gap-1">
              <span className="text-[10px] font-medium text-muted-foreground">
                {t("builder.filter.discipline")}:
              </span>
              {DISCIPLINES.map((d) => {
                const active = filterDisciplines.has(d);
                return (
                  <button
                    key={d}
                    onClick={() => {
                      const next = new Set(filterDisciplines);
                      if (active) next.delete(d);
                      else next.add(d);
                      setFilterDisciplines(next);
                    }}
                    className={`rounded-full border px-1.5 py-0.5 text-[10px] ${active ? DISCIPLINE_BADGE[d] : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {DISCIPLINE_ICON[d]} {d}
                  </button>
                );
              })}
              {filterDisciplines.size > 0 && (
                <button
                  onClick={() => setFilterDisciplines(new Set())}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  <X className="inline h-3 w-3" />
                </button>
              )}
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              <span className="text-[10px] font-medium text-muted-foreground">
                Body region:
              </span>
              {BODY_REGIONS.map((r) => {
                const active = filterRegions.has(r.key);
                return (
                  <button
                    key={r.key}
                    onClick={() => {
                      const next = new Set(filterRegions);
                      if (active) next.delete(r.key);
                      else next.add(r.key);
                      setFilterRegions(next);
                    }}
                    className={`rounded-full border px-1.5 py-0.5 text-[10px] ${active ? BODY_REGION_BADGE : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {r.label}
                  </button>
                );
              })}
              {filterRegions.size > 0 && (
                <button
                  onClick={() => setFilterRegions(new Set())}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  <X className="inline h-3 w-3" />
                </button>
              )}
            </div>
            <div className="space-y-1">
              {filteredBank.map((e) => (
                <div
                  key={e.id}
                  draggable
                  onDragStart={(ev) =>
                    ev.dataTransfer.setData(
                      "application/json",
                      JSON.stringify({ exerciseId: e.id }),
                    )
                  }
                  className="cursor-grab rounded border bg-card p-2 text-xs hover:border-primary"
                >
                  <div className="font-semibold">{e.name_en}</div>
                  <div className="mt-1 flex gap-1">
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${DISCIPLINE_BADGE[e.discipline] ?? ""}`}
                    >
                      {DISCIPLINE_ICON[e.discipline] ?? ""} {e.discipline}
                    </span>
                    {e.body_region && (
                      <Badge variant="outline" className="text-[10px]">
                        {e.body_region}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {filteredBank.length} exercises
            </div>
          </aside>
        )}

        <div
          className="flex-1 overflow-auto p-6"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            try {
              const data = JSON.parse(
                e.dataTransfer.getData("application/json"),
              );
              if (data.exerciseId) onDropExercise(data.exerciseId);
            } catch {
              /* noop */
            }
          }}
        >
          <div className="mx-auto max-w-3xl space-y-3">
            {exs.length === 0 ? (
              <div className="rounded-md border border-dashed py-16 text-center text-sm text-muted-foreground">
                <Dumbbell className="mx-auto mb-2 h-8 w-8 opacity-50" />
                Drag exercises from the bank to add them to this session.
              </div>
            ) : (
              exs.map((e, idx) => (
                <ExerciseCard
                  key={e.id}
                  se={e}
                  defaultExpanded={idx === exs.length - 1 && exs.length <= 2}
                  onChanged={invalidate}
                  oneRmKg={latestRmByEx.get(e.exercise_id) ?? null}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < exs.length - 1}
                  onMoveUp={() => moveExercise(idx, -1)}
                  onMoveDown={() => moveExercise(idx, 1)}
                  onOptimisticRemove={(id) => {
                    qc.setQueryData<SE[]>(["session-exs", sessionId], (prev) =>
                      (prev ?? []).filter((row) => row.id !== id),
                    );
                  }}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExerciseCard({
  se,
  defaultExpanded,
  onChanged,
  oneRmKg,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onOptimisticRemove,
}: {
  se: SE;
  defaultExpanded?: boolean;
  onChanged: () => void;
  oneRmKg: number | null;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onOptimisticRemove?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const discipline = (se.exercises?.discipline ?? "Strength") as Discipline;
  const initial = useMemo(
    () => rowToPrescription(se as unknown as Record<string, unknown>),
    [se],
  );
  const summary = summarizePrescription(discipline, initial, oneRmKg);

  async function remove() {
    onOptimisticRemove?.(se.id);
    const { error } = await supabase
      .from("session_exercises")
      .delete()
      .eq("id", se.id);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      onChanged();
    }
  }

  return (
    <div className="rounded border bg-card p-3 text-sm">
      <div className="flex items-center gap-2">
        <GripVertical className="h-3 w-3 text-muted-foreground" />
        <span title={discipline}>{DISCIPLINE_ICON[discipline]}</span>
        <span className="flex-1 truncate font-semibold">
          {se.exercises?.name_en}
        </span>
        <button
          onClick={onMoveUp}
          disabled={!canMoveUp}
          title="Move up"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={!canMoveDown}
          title="Move down"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
        <button onClick={() => setExpanded((v) => !v)}>
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <button onClick={remove}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </button>
      </div>
      {!expanded ? (
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {summary || "—"}
        </div>
      ) : (
        <div className="mt-2">
          <PrescriptionForm
            rowId={se.id}
            discipline={discipline}
            initial={initial}
            oneRmKg={oneRmKg}
            strokeDefault={se.exercises?.stroke_default ?? null}
            onChanged={onChanged}
          />
        </div>
      )}
    </div>
  );
}

// silence unused-import warnings for navigate (used)
void parseISODate;
