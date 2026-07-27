import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Copy,
  Trash2,
  Moon,
  Dumbbell,
  GripVertical,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { CopyWeekDialog } from "@/components/coachdesk/CopyWeekDialog";
import {
  blockStart,
  weekRange,
  formatShort,
  weekIndexForDate,
  DAYS_OF_WEEK,
} from "@/lib/coachdesk/periodization";
import {
  ExerciseBank,
  insertExerciseIntoSession,
} from "@/components/coachdesk/ExerciseBank";
import { SessionExercises } from "@/components/coachdesk/SessionExercises";
import { usePlanRealtime } from "@/hooks/use-plan-realtime";

type Session = {
  id: string;
  name: string | null;
  day_of_week: number;
  week_number: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export function BlockDetailPage() {
  const { planId, blockId } = useParams({
    from: "/_authenticated/plans/$planId/blocks/$blockId",
  });
  const navigate = useNavigate();
  const qc = useQueryClient();
  usePlanRealtime(planId);
  const [showBank, setShowBank] = useState(true);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    new Set(),
  );
  const [selectedExercise, setSelectedExercise] = useState<{
    id: string;
    name: string;
  } | null>(null);

  function toggleSession(id: string) {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const { data: ctx } = useQuery({
    queryKey: ["block-ctx", blockId],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_blocks")
        .select(
          "id, name, weeks, position, plan_id, training_plans(id, name, start_date, status, athlete_id, clients(id, name))",
        )
        .eq("id", blockId)
        .single();
      return data as any;
    },
  });

  const { data: siblingBlocks = [] } = useQuery({
    queryKey: ["plan-blocks", planId],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_blocks")
        .select("position, weeks")
        .eq("plan_id", planId);
      return (data ?? []) as { position: number; weeks: number }[];
    },
  });

  const bStart = useMemo(() => {
    if (!ctx) return null;
    return blockStart(
      ctx.training_plans.start_date,
      siblingBlocks,
      ctx.position,
    );
  }, [ctx, siblingBlocks]);

  const totalWeeks = ctx?.weeks ?? 0;
  const planActive = ctx?.training_plans?.status === "active";
  const todayWeek = useMemo(() => {
    if (!bStart || !planActive) return null;
    return weekIndexForDate(bStart, totalWeeks, new Date());
  }, [bStart, totalWeeks, planActive]);

  const [activeWeek, setActiveWeek] = useState<number>(1);
  const [didInit, setDidInit] = useState(false);

  const { data: sessions = [] } = useQuery({
    queryKey: ["block-sessions", blockId],
    enabled: !!ctx,
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select(
          "id, name, day_of_week, week_number, status, created_at, updated_at",
        )
        .eq("block_id", blockId)
        .order("week_number")
        .order("day_of_week");
      return (data ?? []) as Session[];
    },
  });

  // Bulk-fetch exercise counts for every session in the block in ONE query,
  // instead of N parallel count() queries (one per day card).
  const sessionIds = useMemo(() => sessions.map((s) => s.id), [sessions]);
  const { data: exCountMap, isFetched: countsFetched } = useQuery<
    Record<string, number>
  >({
    queryKey: ["block-session-ex-counts", blockId, sessionIds.length],
    enabled: sessionIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("session_exercises")
        .select("session_id")
        .in("session_id", sessionIds);
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as { session_id: string }[]) {
        map[row.session_id] = (map[row.session_id] ?? 0) + 1;
      }
      // Make sure every session id is present (0 for empty days).
      for (const id of sessionIds) if (!(id in map)) map[id] = 0;
      return map;
    },
    staleTime: 60_000,
  });

  function bumpCount(sessionId: string, delta: number) {
    qc.setQueryData<Record<string, number>>(
      ["block-session-ex-counts", blockId, sessionIds.length],
      (prev) => {
        const next = { ...(prev ?? {}) };
        next[sessionId] = Math.max(0, (next[sessionId] ?? 0) + delta);
        return next;
      },
    );
  }

  useEffect(() => {
    if (!ctx || didInit) return;
    const weekHasSessions = (week: number) =>
      sessions.some((s) => s.week_number === week);
    if (todayWeek && weekHasSessions(todayWeek)) {
      setActiveWeek(todayWeek);
    } else if (sessions.length > 0) {
      const latest = [...sessions].sort((a, b) => {
        const at = new Date(a.updated_at ?? a.created_at).getTime();
        const bt = new Date(b.updated_at ?? b.created_at).getTime();
        return bt - at;
      })[0];
      setActiveWeek(latest.week_number);
    } else if (todayWeek) {
      setActiveWeek(todayWeek);
    }
    setDidInit(true);
  }, [ctx, didInit, sessions, todayWeek]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["block-sessions", blockId] });
  }

  async function createSession(
    week: number,
    day: number,
    opts?: { silent?: boolean },
  ) {
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        block_id: blockId,
        week_number: week,
        day_of_week: day,
        status: "active",
      } as never)
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      return null;
    }
    invalidate();
    if (data && !opts?.silent) {
      setExpandedSessions((p) => new Set(p).add(data.id));
    }
    return data as { id: string } | null;
  }

  async function deleteSession(id: string) {
    // Optimistic remove from local cache so the UI reacts instantly on iPad
    // (the blocking window.confirm + cascade-delete + global realtime
    // invalidation chain made this feel like 5–10s of lag).
    const prev = qc.getQueryData<Session[]>(["block-sessions", blockId]);
    qc.setQueryData<Session[]>(["block-sessions", blockId], (cur) =>
      (cur ?? []).filter((s) => s.id !== id),
    );
    const { error } = await supabase.from("sessions").delete().eq("id", id);
    if (error) {
      qc.setQueryData(["block-sessions", blockId], prev);
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    toast.success("Session deleted", {
      action: {
        label: "Undo",
        onClick: async () => {
          const row = prev?.find((s) => s.id === id);
          if (!row) return;
          await supabase.from("sessions").insert({
            id: row.id,
            block_id: blockId,
            week_number: row.week_number,
            day_of_week: row.day_of_week,
            name: row.name,
            status: row.status,
          } as never);
          invalidate();
        },
      },
    });
  }

  async function moveSession(sessionId: string, newDay: number) {
    const { error } = await supabase
      .from("sessions")
      .update({ day_of_week: newDay })
      .eq("id", sessionId);
    if (error) toast.error(error.message);
    invalidate();
  }

  async function addExerciseToDay(
    week: number,
    day: number,
    exerciseId: string,
  ) {
    const existing = sessions.filter(
      (s) => s.week_number === week && s.day_of_week === day,
    );
    let targetId = existing[0]?.id;
    if (!targetId) {
      const created = await createSession(week, day, { silent: true });
      if (!created) return;
      targetId = created.id;
    }
    const { error } = await insertExerciseIntoSession(targetId, exerciseId);
    if (error) {
      toast.error(`Add exercise failed: ${error.message}`);
      return;
    }
    toast.success("Exercise added");
    setExpandedSessions((p) => new Set(p).add(targetId!));
    bumpCount(targetId, +1);
    qc.invalidateQueries({ queryKey: ["session-exs", targetId] });
    qc.invalidateQueries({ queryKey: ["session-ex-count", targetId] });
  }

  async function handleDayDrop(week: number, day: number, ev: React.DragEvent) {
    ev.preventDefault();
    const sid = ev.dataTransfer.getData("text/session-id");
    if (sid) {
      moveSession(sid, day);
      return;
    }
    const raw =
      ev.dataTransfer.getData("application/json") ||
      ev.dataTransfer.getData("text/exercise-id") ||
      ev.dataTransfer.getData("text/plain");
    if (!raw) return;
    let exerciseId: string | undefined;
    try {
      exerciseId = JSON.parse(raw).exerciseId;
    } catch {
      exerciseId = raw;
    }
    if (!exerciseId) return;
    await addExerciseToDay(week, day, exerciseId);
  }

  const [showCopyDialog, setShowCopyDialog] = useState(false);

  async function toggleRest(s: Session) {
    const newStatus = s.status === "rest" ? "active" : "rest";
    const { error } = await supabase
      .from("sessions")
      .update({ status: newStatus })
      .eq("id", s.id);
    if (error) return toast.error(`Save failed: ${error.message}`);
    invalidate();
  }

  if (!ctx || !bStart)
    return <div className="p-6 text-muted-foreground">Loading…</div>;

  const planId_ = ctx.plan_id as string;
  const clientId = ctx.training_plans.athlete_id as string;

  const activeWeekRange = weekRange(bStart, activeWeek);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="border-b bg-card px-4 py-3">
        <nav className="text-xs text-muted-foreground">
          <Link
            to="/clients/$clientId"
            params={{ clientId }}
            className="hover:text-foreground"
          >
            {ctx.training_plans.clients?.name}
          </Link>
          <span> / </span>
          <Link
            to="/plans/$planId"
            params={{ planId: planId_ }}
            className="hover:text-foreground"
          >
            {ctx.training_plans.name}
          </Link>
          <span> / </span>
          <span>{ctx.name}</span>
        </nav>
        <div className="mt-2 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              navigate({ to: "/plans/$planId", params: { planId: planId_ } })
            }
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{ctx.name}</h1>
            <div className="text-xs text-muted-foreground">
              Week {activeWeek} of {totalWeeks} ·{" "}
              {formatShort(activeWeekRange.start)} –{" "}
              {formatShort(activeWeekRange.end)}
            </div>
          </div>
          <Button variant="outline" onClick={() => setShowCopyDialog(true)}>
            <Copy className="mr-1 h-4 w-4" /> Copy Week
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => {
            const r = weekRange(bStart, w);
            const isCurrent = todayWeek === w;
            const active = activeWeek === w;
            return (
              <button
                key={w}
                onClick={() => setActiveWeek(w)}
                className={`rounded-md border px-3 py-1 text-xs transition ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"} ${isCurrent && !active ? "border-primary" : ""}`}
              >
                Week {w} ({formatShort(r.start)}–{formatShort(r.end)})
                {isCurrent && (
                  <span className="ml-1 text-[9px] uppercase">today</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {showBank && (
          <ExerciseBank
            selectedExerciseId={selectedExercise?.id ?? null}
            onSelectExercise={setSelectedExercise}
          />
        )}
        <div className="flex-1 overflow-auto p-4">
          <div className="mb-2 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBank((v) => !v)}
            >
              {showBank ? "Hide" : "Show"} Bank
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            {DAYS_OF_WEEK.map((label, idx) => {
              const day = idx + 1; // 1..7
              const dayDate = new Date(activeWeekRange.start);
              dayDate.setDate(dayDate.getDate() + idx);
              const daySessions = sessions.filter(
                (s) => s.week_number === activeWeek && s.day_of_week === day,
              );
              return (
                <div
                  key={day}
                  className="flex min-h-[120px] flex-col rounded-md border bg-card md:flex-row"
                  onClick={(e) => {
                    if (!selectedExercise) return;
                    if ((e.target as HTMLElement).closest("button,a")) return;
                    addExerciseToDay(activeWeek, day, selectedExercise.id);
                    setSelectedExercise(null);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDayDrop(activeWeek, day, e)}
                >
                  <div className="flex items-center justify-between border-b px-3 py-2 md:w-40 md:shrink-0 md:border-b-0 md:border-r">
                    <div>
                      <div className="text-sm font-semibold">{label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatShort(dayDate)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-2">
                    {daySessions.map((s) => {
                      const isExpanded = expandedSessions.has(s.id);
                      return (
                        <Card key={s.id} className="p-2">
                          <div className="flex items-center gap-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData(
                                      "text/session-id",
                                      s.id,
                                    );
                                  }}
                                  className="cursor-grab text-muted-foreground hover:text-foreground"
                                  title="Drag or tap to move to another day"
                                  aria-label="Move session"
                                >
                                  <GripVertical className="h-3 w-3" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">
                                  Move to day
                                </div>
                                {DAYS_OF_WEEK.map((dl, di) => {
                                  const target = di + 1;
                                  if (target === s.day_of_week) return null;
                                  return (
                                    <DropdownMenuItem
                                      key={target}
                                      onClick={() => moveSession(s.id, target)}
                                    >
                                      {dl}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {s.status === "rest" ? (
                              <div className="flex-1 text-center text-xs text-muted-foreground">
                                <Moon className="mx-auto h-4 w-4" /> Rest
                              </div>
                            ) : (
                              <button
                                onClick={() => toggleSession(s.id)}
                                className="flex flex-1 min-w-0 items-center gap-1 text-left"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                                <Dumbbell className="h-3 w-3 text-primary" />
                                <span className="truncate text-xs font-semibold">
                                  {s.name || label}
                                </span>
                              </button>
                            )}
                            <Link
                              to="/builder/$sessionId"
                              params={{ sessionId: s.id }}
                              className="text-[10px] text-muted-foreground hover:text-primary"
                              title="Open full editor"
                            >
                              Open
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => toggleRest(s)}
                              title="Toggle rest"
                            >
                              <Moon
                                className={`h-3 w-3 ${s.status === "rest" ? "fill-blue-400 text-blue-500" : "text-muted-foreground"}`}
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => deleteSession(s.id)}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                          {s.status !== "rest" &&
                            (isExpanded ? (
                              <div className="mt-2">
                                <SessionExercises
                                  sessionId={s.id}
                                  clientId={clientId}
                                  compact
                                />
                              </div>
                            ) : (
                              <button
                                onClick={() => toggleSession(s.id)}
                                className="mt-1 block w-full text-left"
                              >
                                <SessionExCount
                                  count={exCountMap?.[s.id]}
                                  loaded={countsFetched}
                                />
                              </button>
                            ))}
                        </Card>
                      );
                    })}
                    <button
                      onClick={() => createSession(activeWeek, day)}
                      className="flex w-full items-center justify-center rounded border border-dashed py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                    >
                      <Plus className="mr-1 h-3 w-3" />{" "}
                      {daySessions.length ? "Add another" : "Session"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {showCopyDialog && (
        <CopyWeekDialog
          planId={planId_}
          currentBlockId={blockId}
          currentWeek={activeWeek}
          onClose={() => setShowCopyDialog(false)}
          onCopied={invalidate}
        />
      )}
    </div>
  );
}

function SessionExCount({
  count,
  loaded,
}: {
  count: number | undefined;
  loaded: boolean;
}) {
  // Show a placeholder until the bulk count query has resolved so day cards
  // never display a misleading "0 exercises" while data is still loading.
  if (!loaded || count === undefined) {
    return <div className="mt-0.5 text-[10px] text-muted-foreground">…</div>;
  }
  return (
    <div className="mt-0.5 text-[10px] text-muted-foreground">
      {count} exercise{count === 1 ? "" : "s"}
    </div>
  );
}

// Re-export to satisfy unused-import warnings if any.
export const _Badge = Badge;
