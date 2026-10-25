import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Discipline } from "@/lib/coachdesk/prescription";
import type { IntervalRowInput } from "@/lib/coachdesk/interval-templates";
import { RestField } from "@/components/coachdesk/RestField";
import {
  type ZoneNumber,
  bikeZoneWattsMid,
  formatSecondsToPace,
  swimZonePaceSec,
} from "@/lib/coachdesk/zones";

export type IntervalRow = IntervalRowInput & {
  id: string;
  session_exercise_id: string;
  workout_block_id?: string | null;
  order_index: number;
};

const STROKES = ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "IM"];

// A round's "owner": either a plain session_exercise (the original,
// one-structure-per-exercise model) or a workout_block within a
// structured Run/Swim/Bike container (a session_exercise can hold several
// independent intervals/pyramid blocks). session_exercise_id is always
// set either way — prescription_intervals requires it — workoutBlockId
// additionally scopes rows to one specific block.
export type IntervalScope = {
  sessionExerciseId: string;
  workoutBlockId?: string;
};

export function intervalsKey(scope: IntervalScope) {
  return [
    "prescription-intervals",
    scope.sessionExerciseId,
    scope.workoutBlockId ?? null,
  ] as const;
}

export function intervalsQuery(scope: IntervalScope) {
  return {
    queryKey: intervalsKey(scope),
    queryFn: async () => {
      let q = supabase
        .from("prescription_intervals")
        .select("*")
        .eq("session_exercise_id", scope.sessionExerciseId);
      q = scope.workoutBlockId
        ? q.eq("workout_block_id", scope.workoutBlockId)
        : q.is("workout_block_id", null);
      const { data, error } = await q.order("order_index");
      if (error) throw error;
      return (data ?? []) as unknown as IntervalRow[];
    },
  };
}

/** Replace every row for a scope atomically (delete then insert). */
export async function replaceIntervals(
  scope: IntervalScope,
  rows: IntervalRowInput[],
) {
  let del = supabase
    .from("prescription_intervals")
    .delete()
    .eq("session_exercise_id", scope.sessionExerciseId);
  del = scope.workoutBlockId
    ? del.eq("workout_block_id", scope.workoutBlockId)
    : del.is("workout_block_id", null);
  const delRes = await del;
  if (delRes.error) throw delRes.error;
  if (!rows.length) return;
  const payload = rows.map((r, i) => ({
    ...r,
    session_exercise_id: scope.sessionExerciseId,
    workout_block_id: scope.workoutBlockId ?? null,
    order_index: i,
  }));
  const ins = await supabase
    .from("prescription_intervals")
    .insert(payload as never);
  if (ins.error) throw ins.error;
}

/** Append rows after whatever already exists for a scope (used by
 * "Generate from template" in additive mode — e.g. a second RSA block
 * added after an existing one, rather than replacing it). */
export async function appendIntervals(
  scope: IntervalScope,
  rows: IntervalRowInput[],
) {
  if (!rows.length) return;
  let q = supabase
    .from("prescription_intervals")
    .select("order_index")
    .eq("session_exercise_id", scope.sessionExerciseId);
  q = scope.workoutBlockId
    ? q.eq("workout_block_id", scope.workoutBlockId)
    : q.is("workout_block_id", null);
  const { data: latest } = await q
    .order("order_index", { ascending: false })
    .limit(1);
  const start = latest && latest.length ? Number(latest[0].order_index) + 1 : 0;
  const payload = rows.map((r, i) => ({
    ...r,
    session_exercise_id: scope.sessionExerciseId,
    workout_block_id: scope.workoutBlockId ?? null,
    order_index: start + i,
  }));
  const ins = await supabase
    .from("prescription_intervals")
    .insert(payload as never);
  if (ins.error) throw ins.error;
}

// Latest FTP (watts) or CSS (sec/100m) test on file for a client — shared
// by IntervalBuilder's per-round zone pickers and TemplateForm's RSA zone
// generation.
export function useLatestThreshold(
  clientId: string | null | undefined,
  metric: "ftp_watts" | "css_pace_sec_per_100m",
) {
  return useQuery({
    queryKey: ["latest-threshold", clientId, metric],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_threshold_tests")
        .select("value")
        .eq("client_id", clientId!)
        .eq("metric", metric)
        .order("tested_date", { ascending: false })
        .limit(1);
      return data && data.length ? Number(data[0].value) : null;
    },
  });
}

export function IntervalBuilder({
  sessionExerciseId,
  workoutBlockId,
  discipline,
  clientId = null,
  intensityMode,
}: {
  sessionExerciseId: string;
  workoutBlockId?: string;
  discipline: Discipline;
  clientId?: string | null;
  /** Which of Zone/Pace is binding; the other renders as indicative.
   *  Omitted (legacy per-exercise intervals) = neither is dimmed. */
  intensityMode?: "zone" | "pace";
}) {
  const scope: IntervalScope = { sessionExerciseId, workoutBlockId };
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery(intervalsQuery(scope));
  const { data: ftpWatts } = useLatestThreshold(
    discipline === "Cycling" ? clientId : null,
    "ftp_watts",
  );
  const { data: cssSec } = useLatestThreshold(
    discipline === "Swimming" ? clientId : null,
    "css_pace_sec_per_100m",
  );

  function invalidate() {
    qc.invalidateQueries({ queryKey: intervalsKey(scope) });
  }

  async function addRow() {
    // Always compute the next order_index from the DB to avoid race conditions
    // with stale cache (multiple quick taps, slow refetch after RLS check).
    let latestQ = supabase
      .from("prescription_intervals")
      .select("order_index")
      .eq("session_exercise_id", sessionExerciseId);
    latestQ = workoutBlockId
      ? latestQ.eq("workout_block_id", workoutBlockId)
      : latestQ.is("workout_block_id", null);
    const { data: latest } = await latestQ
      .order("order_index", { ascending: false })
      .limit(1);
    let nextOrder =
      latest && latest.length ? Number(latest[0].order_index) + 1 : 0;
    // Retry on unique-violation in case two clicks raced.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase.from("prescription_intervals").insert({
        session_exercise_id: sessionExerciseId,
        workout_block_id: workoutBlockId ?? null,
        order_index: nextOrder,
        target_unit: "meters",
        rest_type: "passive",
        stroke: discipline === "Swimming" ? "Freestyle" : null,
      } as never);
      if (!error) {
        invalidate();
        return;
      }
      if (error.code === "23505") {
        nextOrder += 1;
        continue;
      }
      return toast.error(`Add failed: ${error.message}`);
    }
    toast.error("Add failed: could not allocate interval slot");
  }

  async function deleteRow(id: string) {
    qc.setQueryData<IntervalRow[]>(intervalsKey(scope), (prev) =>
      (prev ?? []).filter((r) => r.id !== id),
    );
    const { error } = await supabase
      .from("prescription_intervals")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      invalidate();
    }
  }

  async function swap(a: IntervalRow, b: IntervalRow) {
    // Two-step swap to avoid violating unique (session_exercise_id, order_index).
    const tmp = -1 * (Date.now() % 100000);
    await supabase
      .from("prescription_intervals")
      .update({ order_index: tmp } as never)
      .eq("id", a.id);
    await supabase
      .from("prescription_intervals")
      .update({ order_index: a.order_index } as never)
      .eq("id", b.id);
    await supabase
      .from("prescription_intervals")
      .update({ order_index: b.order_index } as never)
      .eq("id", a.id);
    invalidate();
  }

  // Footer totals
  const totals = useMemo(() => {
    let meters = 0,
      seconds = 0;
    for (const r of rows) {
      if (r.target_value == null) continue;
      if (r.target_unit === "meters") meters += Number(r.target_value) || 0;
      else if (r.target_unit === "seconds")
        seconds += Number(r.target_value) || 0;
      else if (r.target_unit === "minutes")
        seconds += (Number(r.target_value) || 0) * 60;
    }
    return { meters, seconds };
  }, [rows]);

  const cols = columnsForDiscipline(discipline);

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-1.5 py-1 text-left w-8">#</th>
              <th className="px-1.5 py-1 text-left">Target</th>
              <th className="px-1.5 py-1 text-left">Unit</th>
              {cols.zone && (
                <th className="px-1.5 py-1 text-left">
                  Zone{intensityMode === "pace" ? " ~" : ""}
                </th>
              )}
              {cols.pace && (
                <th className="px-1.5 py-1 text-left">
                  Pace{intensityMode === "zone" ? " ~" : ""}
                </th>
              )}
              {cols.watts && <th className="px-1.5 py-1 text-left">W</th>}
              {cols.cadence && <th className="px-1.5 py-1 text-left">RPM</th>}
              {cols.stroke && <th className="px-1.5 py-1 text-left">Stroke</th>}
              <th className="px-1.5 py-1 text-left">Rest</th>
              <th className="px-1.5 py-1 w-20" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <IntervalRowEditor
                key={r.id}
                row={r}
                index={idx}
                cols={cols}
                cssSec={cssSec ?? null}
                ftpWatts={ftpWatts ?? null}
                intensityMode={intensityMode}
                canUp={idx > 0}
                canDown={idx < rows.length - 1}
                onSwapUp={() => swap(r, rows[idx - 1])}
                onSwapDown={() => swap(r, rows[idx + 1])}
                onDelete={() => deleteRow(r.id)}
              />
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={12}
                  className="px-3 py-4 text-center text-muted-foreground"
                >
                  No intervals yet — add one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={addRow}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add interval
        </Button>
        <div className="text-[11px] text-muted-foreground">
          Total: {totals.meters > 0 && <span>{totals.meters}m</span>}
          {totals.meters > 0 && totals.seconds > 0 && <span> · </span>}
          {totals.seconds > 0 && <span>{formatSeconds(totals.seconds)}</span>}
          {totals.meters === 0 && totals.seconds === 0 && <span>—</span>}
        </div>
      </div>
    </div>
  );
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

type ColumnFlags = {
  pace: boolean;
  zone: boolean;
  watts: boolean;
  cadence: boolean;
  stroke: boolean;
};
// Per-round labels ("Build 2", "Peak") and the old HR/intensity/rest-type
// columns were dropped: the label added noise without meaning, and HR +
// "intensity" duplicated what Zone already says. Zone and Pace both stay,
// with intensityMode marking which one is binding.
function columnsForDiscipline(d: Discipline): ColumnFlags {
  switch (d) {
    case "Cycling":
      return {
        pace: false,
        zone: true,
        watts: true,
        cadence: true,
        stroke: false,
      };
    case "Swimming":
      return {
        pace: true,
        zone: true,
        watts: false,
        cadence: false,
        stroke: true,
      };
    default:
      return {
        pace: true,
        zone: true,
        watts: false,
        cadence: false,
        stroke: false,
      };
  }
}

function IntervalRowEditor({
  row,
  index,
  cols,
  cssSec = null,
  ftpWatts = null,
  intensityMode,
  canUp,
  canDown,
  onSwapUp,
  onSwapDown,
  onDelete,
}: {
  row: IntervalRow;
  index: number;
  cols: ColumnFlags;
  cssSec?: number | null;
  ftpWatts?: number | null;
  intensityMode?: "zone" | "pace";
  canUp: boolean;
  canDown: boolean;
  onSwapUp: () => void;
  onSwapDown: () => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [local, setLocal] = useState<IntervalRow>(row);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const dirty = useRef(false);
  const timer = useRef<number | null>(null);
  const savingRef = useRef(false);
  const localRef = useRef(local);
  const idRef = useRef(row.id);
  const scopeRef = useRef<IntervalScope>({
    sessionExerciseId: row.session_exercise_id,
    workoutBlockId: row.workout_block_id ?? undefined,
  });
  localRef.current = local;

  useEffect(() => {
    if (row.id !== idRef.current) {
      idRef.current = row.id;
      setLocal(row);
      dirty.current = false;
      return;
    }
    if (!dirty.current) setLocal(row);
  }, [row]);

  const flush = useCallback(async () => {
    if (!dirty.current || savingRef.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    savingRef.current = true;
    setStatus("saving");
    dirty.current = false;
    const next = localRef.current;
    const payload = {
      label: next.label,
      target_value: next.target_value,
      target_unit: next.target_unit,
      pace_per_km: next.pace_per_km,
      hr_zone: next.hr_zone,
      watts: next.watts,
      cadence: next.cadence,
      stroke: next.stroke,
      intensity: next.intensity,
      rest_seconds: next.rest_seconds,
      rest_type: next.rest_type,
      rest_mode: next.rest_mode ?? "seconds",
      rest_ratio: next.rest_ratio ?? null,
    };
    const { error } = await supabase
      .from("prescription_intervals")
      .update(payload as never)
      .eq("id", idRef.current);
    savingRef.current = false;
    if (error) {
      dirty.current = true;
      setStatus("error");
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    if (!dirty.current) {
      setStatus("saved");
      // The footer total (and anything else reading the parent's row list)
      // is computed from the react-query cache, not this row's own local
      // state — without this, editing an existing row's target value saved
      // fine but the total stayed stuck at whatever it was after the last
      // add/delete/reorder.
      qc.invalidateQueries({ queryKey: intervalsKey(scopeRef.current) });
      window.setTimeout(
        () => setStatus((s) => (s === "saved" ? "idle" : s)),
        1200,
      );
    } else {
      timer.current = window.setTimeout(flush, 120);
    }
  }, [qc]);

  useEffect(() => {
    function onBefore() {
      void flush();
    }
    window.addEventListener("beforeunload", onBefore);
    window.addEventListener("pagehide", onBefore);
    return () => {
      window.removeEventListener("beforeunload", onBefore);
      window.removeEventListener("pagehide", onBefore);
      if (dirty.current) void flush();
    };
  }, [flush]);

  function patch(p: Partial<IntervalRow>) {
    setLocal((prev) => {
      const next = { ...prev, ...p };
      localRef.current = next;
      return next;
    });
    dirty.current = true;
    setStatus("saving");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 150);
  }

  function num(v: string): number | null {
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // The field that is NOT binding renders dimmed with a "~" hint.
  const secondary =
    intensityMode === "zone"
      ? "pace"
      : intensityMode === "pace"
        ? "zone"
        : null;

  return (
    <tr className="border-t border-border" onBlur={() => void flush()}>
      <td className="px-1.5 py-1 text-muted-foreground">{index + 1}</td>
      <td className="px-1.5 py-1">
        <Input
          className="h-7 text-xs w-20"
          type="number"
          value={local.target_value ?? ""}
          onChange={(e) => patch({ target_value: num(e.target.value) })}
        />
      </td>
      <td className="px-1.5 py-1">
        <Select
          value={local.target_unit}
          onValueChange={(v) =>
            patch({ target_unit: v as IntervalRow["target_unit"] })
          }
        >
          <SelectTrigger className="h-7 text-xs w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="meters">m</SelectItem>
            <SelectItem value="seconds">sec</SelectItem>
            <SelectItem value="minutes">min</SelectItem>
          </SelectContent>
        </Select>
      </td>
      {cols.zone && (
        <td
          className={`px-1.5 py-1 ${secondary === "zone" ? "opacity-50" : ""}`}
        >
          <Select
            value={local.hr_zone == null ? "_" : String(local.hr_zone)}
            onValueChange={(v) => {
              if (v === "_") return patch({ hr_zone: null });
              const z = Number(v) as ZoneNumber;
              // Picking a zone also fills the indicative pace/watts when the
              // athlete has a threshold test on file.
              const extra: Partial<IntervalRow> = {};
              if (cssSec != null)
                extra.pace_per_km = formatSecondsToPace(
                  swimZonePaceSec(cssSec, z),
                );
              else if (ftpWatts != null)
                extra.watts = bikeZoneWattsMid(ftpWatts, z);
              patch({ hr_zone: z, ...extra });
            }}
          >
            <SelectTrigger
              className="h-7 text-xs w-16"
              title={secondary === "zone" ? "Indicative only" : "Zone"}
            >
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_">—</SelectItem>
              {([1, 2, 3, 4, 5] as ZoneNumber[]).map((z) => (
                <SelectItem key={z} value={String(z)}>
                  Z{z}
                  {cssSec != null
                    ? ` · ${formatSecondsToPace(swimZonePaceSec(cssSec, z))}`
                    : ftpWatts != null
                      ? ` · ${bikeZoneWattsMid(ftpWatts, z)}W`
                      : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
      )}
      {cols.pace && (
        <td
          className={`px-1.5 py-1 ${secondary === "pace" ? "opacity-50" : ""}`}
        >
          <Input
            className="h-7 text-xs w-20"
            value={local.pace_per_km ?? ""}
            placeholder={secondary === "pace" ? "~4:30" : "4:30"}
            title={secondary === "pace" ? "Indicative only" : "Pace"}
            onChange={(e) => patch({ pace_per_km: e.target.value || null })}
          />
        </td>
      )}
      {cols.watts && (
        <td className="px-1.5 py-1">
          <Input
            className="h-7 text-xs w-16"
            type="number"
            value={local.watts ?? ""}
            onChange={(e) => patch({ watts: num(e.target.value) })}
          />
        </td>
      )}
      {cols.cadence && (
        <td className="px-1.5 py-1">
          <Input
            className="h-7 text-xs w-16"
            type="number"
            value={local.cadence ?? ""}
            onChange={(e) => patch({ cadence: num(e.target.value) })}
          />
        </td>
      )}
      {cols.stroke && (
        <td className="px-1.5 py-1">
          <Select
            value={local.stroke ?? "_"}
            onValueChange={(v) => patch({ stroke: v === "_" ? null : v })}
          >
            <SelectTrigger className="h-7 text-xs w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_">—</SelectItem>
              {STROKES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
      )}
      <td className="px-1.5 py-1">
        <RestField
          value={{
            rest_mode: local.rest_mode ?? "seconds",
            rest_seconds: local.rest_seconds,
            rest_ratio: local.rest_ratio ?? null,
          }}
          onChange={(next) => patch(next)}
        />
      </td>
      <td className="px-1.5 py-1">
        <div className="flex items-center justify-end gap-0.5">
          <SaveDot status={status} />
          <button
            onClick={onSwapUp}
            disabled={!canUp}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            title="Move up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onSwapDown}
            disabled={!canDown}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            title="Move down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="rounded p-0.5 text-destructive hover:bg-destructive/10"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function SaveDot({
  status,
}: {
  status: "idle" | "saving" | "saved" | "error";
}) {
  if (status === "idle") return <span className="w-3" />;
  if (status === "saving")
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  if (status === "saved") return <Check className="h-3 w-3 text-foreground" />;
  return <span className="h-2 w-2 rounded-full bg-destructive" />;
}

// Re-export Label for callers that compose around the builder.
export { Label as IntervalLabel };
