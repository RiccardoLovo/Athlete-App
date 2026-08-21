import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  BORG_LABELS,
  borgColor,
  DAY_LABELS,
  distanceUnitFor,
} from "@/lib/coachdesk/constants";
import {
  parseISODate,
  toISODate,
  formatLong,
} from "@/lib/coachdesk/periodization";
import { toast } from "sonner";
import {
  EMPTY_LAST_WEIGHTS,
  fetchLastLoggedWeights,
} from "@/features/dashboard/AthleteDashboard";
import {
  rowToPrescription,
  summarizeIntervals,
  summarizePrescription,
  type Discipline as ExerciseDiscipline,
} from "@/lib/coachdesk/prescription";
import type { IntervalRowInput } from "@/lib/coachdesk/interval-templates";
import type { PlanSession } from "./feedback.types";

const EMPTY_FEEDBACK_ROWS: any[] = [];

type SetEntry = { weight: string; reps: string };
type ExForm = {
  sets: SetEntry[];
  notes: string;
  distance: string;
  duration: string;
  pace: string;
  intervalActuals: string[];
};
const EMPTY_EXFORM: ExForm = {
  sets: [],
  notes: "",
  distance: "",
  duration: "",
  pace: "",
  intervalActuals: [],
};

type IntervalRow = IntervalRowInput & {
  id: string;
  session_exercise_id: string;
  order_index: number;
};

async function fetchIntervalRounds(
  sessionExerciseIds: string[],
): Promise<Record<string, IntervalRow[]>> {
  if (!sessionExerciseIds.length) return {};
  const { data } = await supabase
    .from("prescription_intervals")
    .select("*")
    .in("session_exercise_id", sessionExerciseIds)
    .order("order_index");
  const map: Record<string, IntervalRow[]> = {};
  for (const row of (data ?? []) as unknown as IntervalRow[]) {
    (map[row.session_exercise_id] ??= []).push(row);
  }
  return map;
}
const EMPTY_INTERVAL_ROUNDS: Record<string, IntervalRow[]> = {};

export function MyFeedbackDetail({
  client,
  session,
  onBack,
}: {
  client: { id: string; coach_id: string };
  session: PlanSession;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const existing = session.log;
  const [borg, setBorg] = useState(existing?.borg_scale ?? 5);
  const [overall, setOverall] = useState(existing?.overall_notes ?? "");
  const [performedAt, setPerformedAt] = useState<string>(
    existing?.performed_at ?? session.planned_date,
  );
  const [saving, setSaving] = useState(false);

  const { data: exsData } = useQuery({
    queryKey: ["my-fb-exs", session.id, client.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("session_exercises")
        .select("*, exercises(name_en, discipline, structure_type)")
        .eq("session_id", session.id)
        .order("order_index");
      const list = (data ?? []) as any[];
      const lastWeights = await fetchLastLoggedWeights(client.id, list);
      const intervalRounds = await fetchIntervalRounds(
        list
          .filter((e) => e.exercises?.structure_type === "intervals")
          .map((e) => e.id),
      );
      return { list, lastWeights, intervalRounds };
    },
  });
  const exs = exsData?.list ?? EMPTY_FEEDBACK_ROWS;
  const lastWeights = exsData?.lastWeights ?? EMPTY_LAST_WEIGHTS;
  const intervalRounds = exsData?.intervalRounds ?? EMPTY_INTERVAL_ROUNDS;

  const { data: existingExLogsData } = useQuery({
    queryKey: ["my-fb-ex-logs", existing?.id],
    enabled: !!existing?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("exercise_logs")
        .select(
          "id, session_exercise_id, weight_done, reps_done, notes, sets_json, distance_km, duration_min, pace",
        )
        .eq("workout_log_id", existing!.id);
      return (data ?? []) as any[];
    },
  });
  const existingExLogs = existingExLogsData ?? EMPTY_FEEDBACK_ROWS;

  const [forms, setForms] = useState<Record<string, ExForm>>({});
  useEffect(() => {
    const init: Record<string, ExForm> = {};
    const byId = new Map<string, any>();
    for (const el of existingExLogs) byId.set(el.session_exercise_id, el);
    for (const e of exs) {
      const el = byId.get(e.id);
      const setCount = Math.max(1, Number(e.sets) || 1);
      const prescribedWeight =
        e.load_mode === "bodyweight"
          ? "0"
          : e.load_value != null
            ? String(e.load_value)
            : "";
      const defaultWeight =
        prescribedWeight || lastWeights[e.exercise_id] || "";
      const defaultReps = e.reps != null ? String(e.reps) : "";
      let sets: SetEntry[] = [];
      const stored = Array.isArray(el?.sets_json) ? el!.sets_json : null;
      if (stored && stored.length > 0) {
        sets = stored.map((s: any) => ({
          weight: s?.weight ?? "",
          reps: s?.reps ?? "",
        }));
      } else if (el && (el.weight_done || el.reps_done)) {
        // Legacy single-row log: seed all sets with the same value
        sets = Array.from({ length: setCount }, () => ({
          weight: el.weight_done ?? defaultWeight,
          reps: el.reps_done ?? defaultReps,
        }));
      } else {
        sets = Array.from({ length: setCount }, () => ({
          weight: defaultWeight,
          reps: defaultReps,
        }));
      }
      const discipline = (e.exercises?.discipline ??
        "Strength") as ExerciseDiscipline;
      const distanceUnit = distanceUnitFor(discipline);
      const prescribedDistance =
        e.distance_km != null
          ? String(
              distanceUnit === "m"
                ? Math.round(e.distance_km * 1000)
                : e.distance_km,
            )
          : "";
      const distance =
        el?.distance_km != null
          ? String(
              distanceUnit === "m"
                ? Math.round(el.distance_km * 1000)
                : el.distance_km,
            )
          : prescribedDistance;
      const duration =
        el?.duration_min != null
          ? String(el.duration_min)
          : e.duration_min != null
            ? String(e.duration_min)
            : "";
      const pace = el?.pace || e.pace || "";

      const rounds = intervalRounds[e.id] ?? [];
      const storedActuals = Array.isArray(el?.sets_json) ? el!.sets_json : null;
      const intervalActuals = rounds.map((round, idx) => {
        const stored = storedActuals?.[idx]?.value;
        if (stored != null && stored !== "") return String(stored);
        return round.target_value != null ? String(round.target_value) : "";
      });

      init[e.id] = {
        sets,
        notes: el?.notes ?? "",
        distance,
        duration,
        pace,
        intervalActuals,
      };
    }
    setForms(init);
  }, [exs, existingExLogs]);

  function updateSet(exId: string, idx: number, patch: Partial<SetEntry>) {
    setForms((f) => {
      const cur = f[exId] ?? EMPTY_EXFORM;
      const nextSets = cur.sets.map((s, i) =>
        i === idx ? { ...s, ...patch } : s,
      );
      return { ...f, [exId]: { ...cur, sets: nextSets } };
    });
  }
  function addSet(exId: string) {
    setForms((f) => {
      const cur = f[exId] ?? EMPTY_EXFORM;
      const last = cur.sets[cur.sets.length - 1] ?? { weight: "", reps: "" };
      return { ...f, [exId]: { ...cur, sets: [...cur.sets, { ...last }] } };
    });
  }
  function removeSet(exId: string, idx: number) {
    setForms((f) => {
      const cur = f[exId] ?? EMPTY_EXFORM;
      if (cur.sets.length <= 1) return f;
      return {
        ...f,
        [exId]: { ...cur, sets: cur.sets.filter((_, i) => i !== idx) },
      };
    });
  }
  function updateIntervalActual(exId: string, idx: number, value: string) {
    setForms((f) => {
      const cur = f[exId] ?? EMPTY_EXFORM;
      const next = [...cur.intervalActuals];
      next[idx] = value;
      return { ...f, [exId]: { ...cur, intervalActuals: next } };
    });
  }

  async function submit() {
    setSaving(true);
    try {
      let logId = existing?.id;
      if (logId) {
        const { error } = await supabase
          .from("workout_logs")
          .update({
            borg_scale: borg,
            overall_notes: overall,
            performed_at: performedAt,
          })
          .eq("id", logId);
        if (error) throw error;
      } else {
        const { data: log, error } = await supabase
          .from("workout_logs")
          .insert({
            session_id: session.id,
            client_id: client.id,
            coach_id: client.coach_id,
            borg_scale: borg,
            overall_notes: overall,
            status: "pending",
            performed_at: performedAt,
          })
          .select()
          .single();
        if (error || !log) throw error ?? new Error("Failed");
        logId = log.id;
      }
      // Upsert per-exercise rows: delete existing then insert current
      if (existing?.id) {
        await supabase
          .from("exercise_logs")
          .delete()
          .eq("workout_log_id", existing.id);
      }
      const rows = exs.map((e: any) => {
        const f = forms[e.id] ?? EMPTY_EXFORM;
        const isIntervals = e.exercises?.structure_type === "intervals";
        // Keep the summary text fields populated for legacy views:
        const weightSummary = f.sets.map((s) => s.weight).join(" / ");
        const repsSummary = f.sets.map((s) => s.reps).join(" / ");
        const discipline = (e.exercises?.discipline ??
          "Strength") as ExerciseDiscipline;
        const distanceUnit = distanceUnitFor(discipline);
        const distanceKm =
          f.distance.trim() !== ""
            ? distanceUnit === "m"
              ? Number(f.distance) / 1000
              : Number(f.distance)
            : null;
        return {
          workout_log_id: logId!,
          session_exercise_id: e.id,
          weight_done: weightSummary,
          reps_done: repsSummary,
          notes: f.notes ?? "",
          sets_json: isIntervals
            ? f.intervalActuals.map((value) => ({ value }))
            : f.sets,
          distance_km: distanceKm,
          duration_min: f.duration.trim() !== "" ? Number(f.duration) : null,
          pace: f.pace.trim() !== "" ? f.pace : null,
        };
      });
      if (rows.length) {
        const { error } = await supabase.from("exercise_logs").insert(rows);
        if (error) throw error;
      }
      toast.success(existing ? "Feedback updated" : "Feedback submitted");
      qc.invalidateQueries({ queryKey: ["my-past-sessions"] });
      qc.invalidateQueries({ queryKey: ["workout-logs"] });
      qc.invalidateQueries({ queryKey: ["pending-feedback-count"] });
      onBack();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">
          {session.name || DAY_LABELS[session.day_of_week - 1]}
        </h1>
        {session.types.length > 0 ? (
          session.types.map((t) => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))
        ) : (
          <Badge variant="secondary">Training</Badge>
        )}
        <Badge variant="outline">W{session.week_number}</Badge>
      </div>

      <Card className="p-4">
        <Label className="text-sm font-semibold">Date performed</Label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={performedAt}
            max={toISODate(new Date())}
            onChange={(e) => setPerformedAt(e.target.value)}
            className="w-auto"
          />
          {performedAt !== session.planned_date && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPerformedAt(session.planned_date)}
            >
              Reset to planned ({formatLong(parseISODate(session.planned_date))}
              )
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Planned: {formatLong(parseISODate(session.planned_date))}
        </p>
      </Card>

      <Card className="p-4">
        <Label className="text-sm font-semibold">
          Overall Effort (Borg Scale)
        </Label>
        <div className="mt-3 flex items-center gap-4">
          <Slider
            value={[borg]}
            min={1}
            max={10}
            step={1}
            onValueChange={(v) => setBorg(v[0])}
            className="flex-1"
          />
          <Badge className={`${borgColor(borg)} text-base`}>{borg}/10</Badge>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {BORG_LABELS[borg]}
        </p>
      </Card>

      {exs.map((e: any, i: number) => {
        const f = forms[e.id] ?? EMPTY_EXFORM;
        const discipline = (e.exercises?.discipline ??
          "Strength") as ExerciseDiscipline;
        const isStrength = discipline === "Strength";
        const isIntervals = e.exercises?.structure_type === "intervals";
        const rounds = intervalRounds[e.id] ?? [];
        const distanceUnit = distanceUnitFor(discipline);
        const showPace =
          discipline === "Running" ||
          discipline === "Swimming" ||
          discipline === "Cycling";
        const summary = isIntervals
          ? summarizeIntervals(rounds)
          : summarizePrescription(discipline, rowToPrescription(e));
        return (
          <Card key={e.id} className="p-4">
            <div className="font-semibold">
              {i + 1}. {e.exercises?.name_en ?? "Exercise removed"}
            </div>
            {summary && (
              <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>
            )}

            {isStrength ? (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-10">Set</span>
                  <span>
                    Weight
                    {e.load_mode === "%1RM"
                      ? " (% 1RM)"
                      : e.load_mode === "bodyweight"
                        ? ""
                        : " (kg)"}
                  </span>
                  <span>Reps</span>
                  <span className="w-8" />
                </div>
                {f.sets.map((s, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2"
                  >
                    <span className="w-10 text-sm font-medium text-muted-foreground">
                      #{idx + 1}
                    </span>
                    <Input
                      inputMode="decimal"
                      value={s.weight}
                      onChange={(ev) =>
                        updateSet(e.id, idx, { weight: ev.target.value })
                      }
                    />
                    <Input
                      inputMode="numeric"
                      value={s.reps}
                      onChange={(ev) =>
                        updateSet(e.id, idx, { reps: ev.target.value })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSet(e.id, idx)}
                      disabled={f.sets.length <= 1}
                      aria-label="Remove set"
                    >
                      ✕
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addSet(e.id)}
                >
                  + Add set
                </Button>
              </div>
            ) : isIntervals ? (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-8">#</span>
                  <span>Prescribed</span>
                  <span className="w-24">Actual</span>
                </div>
                {rounds.map((round, idx) => {
                  const unit =
                    round.target_unit === "meters"
                      ? "m"
                      : round.target_unit === "minutes"
                        ? "min"
                        : "s";
                  return (
                    <div
                      key={round.id}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-2"
                    >
                      <span className="w-8 text-sm font-medium text-muted-foreground">
                        #{idx + 1}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {round.label ? `${round.label}: ` : ""}
                        {round.target_value != null
                          ? `${round.target_value}${unit}`
                          : "—"}
                        {round.rest_seconds != null &&
                          ` · rest ${round.rest_seconds}s`}
                      </span>
                      <Input
                        inputMode="decimal"
                        className="w-24"
                        value={f.intervalActuals[idx] ?? ""}
                        onChange={(ev) =>
                          updateIntervalActual(e.id, idx, ev.target.value)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-4">
                <div>
                  <Label className="text-xs">Duration (min)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="mt-1 w-28"
                    value={f.duration}
                    onChange={(ev) =>
                      setForms((prev) => ({
                        ...prev,
                        [e.id]: {
                          ...(prev[e.id] ?? EMPTY_EXFORM),
                          duration: ev.target.value,
                        },
                      }))
                    }
                  />
                </div>
                {distanceUnit && (
                  <div>
                    <Label className="text-xs">Distance ({distanceUnit})</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      className="mt-1 w-28"
                      value={f.distance}
                      onChange={(ev) =>
                        setForms((prev) => ({
                          ...prev,
                          [e.id]: {
                            ...(prev[e.id] ?? EMPTY_EXFORM),
                            distance: ev.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                )}
                {showPace && (
                  <div>
                    <Label className="text-xs">Pace</Label>
                    <Input
                      placeholder={distanceUnit === "m" ? "/100m" : "/km"}
                      className="mt-1 w-28"
                      value={f.pace}
                      onChange={(ev) =>
                        setForms((prev) => ({
                          ...prev,
                          [e.id]: {
                            ...(prev[e.id] ?? EMPTY_EXFORM),
                            pace: ev.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                )}
              </div>
            )}

            <div className="mt-3">
              <Label className="text-xs">Notes</Label>
              <Input
                placeholder="How did it feel?"
                value={f.notes}
                onChange={(ev) =>
                  setForms((prev) => ({
                    ...prev,
                    [e.id]: {
                      ...(prev[e.id] ?? EMPTY_EXFORM),
                      notes: ev.target.value,
                    },
                  }))
                }
              />
            </div>
          </Card>
        );
      })}

      <Card className="p-4">
        <Label className="text-sm font-semibold">Overall Notes</Label>
        <Textarea
          className="mt-2"
          rows={3}
          placeholder="Sleep, energy, anything else…"
          value={overall}
          onChange={(e) => setOverall(e.target.value)}
        />
      </Card>

      <Button className="w-full" size="lg" onClick={submit} disabled={saving}>
        {saving ? "Saving…" : existing ? "Update Feedback" : "Submit Feedback"}
      </Button>
    </div>
  );
}
