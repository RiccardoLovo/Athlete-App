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
import { BORG_LABELS, borgColor, DAY_LABELS } from "@/lib/coachdesk/constants";
import {
  parseISODate,
  toISODate,
  formatLong,
} from "@/lib/coachdesk/periodization";
import { toast } from "sonner";
import type { PlanSession } from "./feedback.types";

const EMPTY_FEEDBACK_ROWS: any[] = [];

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
    queryKey: ["my-fb-exs", session.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("session_exercises")
        .select("id, sets, reps, load_value, load_mode, exercises(name_en)")
        .eq("session_id", session.id)
        .order("order_index");
      return (data ?? []) as any[];
    },
  });
  const exs = exsData ?? EMPTY_FEEDBACK_ROWS;

  const { data: existingExLogsData } = useQuery({
    queryKey: ["my-fb-ex-logs", existing?.id],
    enabled: !!existing?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("exercise_logs")
        .select(
          "id, session_exercise_id, weight_done, reps_done, notes, sets_json",
        )
        .eq("workout_log_id", existing!.id);
      return (data ?? []) as any[];
    },
  });
  const existingExLogs = existingExLogsData ?? EMPTY_FEEDBACK_ROWS;

  type SetEntry = { weight: string; reps: string };
  type ExForm = { sets: SetEntry[]; notes: string };
  const [forms, setForms] = useState<Record<string, ExForm>>({});
  useEffect(() => {
    const init: Record<string, ExForm> = {};
    const byId = new Map<string, any>();
    for (const el of existingExLogs) byId.set(el.session_exercise_id, el);
    for (const e of exs) {
      const el = byId.get(e.id);
      const setCount = Math.max(1, Number(e.sets) || 1);
      const defaultWeight =
        e.load_mode === "bodyweight"
          ? "0"
          : e.load_value != null
            ? String(e.load_value)
            : "";
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
      init[e.id] = { sets, notes: el?.notes ?? "" };
    }
    setForms(init);
  }, [exs, existingExLogs]);

  function updateSet(exId: string, idx: number, patch: Partial<SetEntry>) {
    setForms((f) => {
      const cur = f[exId] ?? { sets: [], notes: "" };
      const nextSets = cur.sets.map((s, i) =>
        i === idx ? { ...s, ...patch } : s,
      );
      return { ...f, [exId]: { ...cur, sets: nextSets } };
    });
  }
  function addSet(exId: string) {
    setForms((f) => {
      const cur = f[exId] ?? { sets: [], notes: "" };
      const last = cur.sets[cur.sets.length - 1] ?? { weight: "", reps: "" };
      return { ...f, [exId]: { ...cur, sets: [...cur.sets, { ...last }] } };
    });
  }
  function removeSet(exId: string, idx: number) {
    setForms((f) => {
      const cur = f[exId] ?? { sets: [], notes: "" };
      if (cur.sets.length <= 1) return f;
      return {
        ...f,
        [exId]: { ...cur, sets: cur.sets.filter((_, i) => i !== idx) },
      };
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
        const f = forms[e.id] ?? { sets: [], notes: "" };
        // Keep the summary text fields populated for legacy views:
        const weightSummary = f.sets.map((s) => s.weight).join(" / ");
        const repsSummary = f.sets.map((s) => s.reps).join(" / ");
        return {
          workout_log_id: logId!,
          session_exercise_id: e.id,
          weight_done: weightSummary,
          reps_done: repsSummary,
          notes: f.notes ?? "",
          sets_json: f.sets,
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
        const f = forms[e.id] ?? { sets: [], notes: "" };
        const weightSuffix =
          e.load_mode === "%1RM"
            ? "% 1RM"
            : e.load_mode === "bodyweight"
              ? ""
              : "kg";
        return (
          <Card key={e.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="font-semibold">
                {i + 1}. {e.exercises?.name_en}
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {e.sets ?? "-"}×{e.reps || "-"}
                {e.load_value != null && ` @ ${e.load_value}${weightSuffix}`}
                {e.load_mode === "bodyweight" && " · bodyweight"}
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2 text-xs text-muted-foreground">
                <span className="w-10">Set</span>
                <span>
                  Weight{weightSuffix ? ` (${weightSuffix.trim()})` : ""}
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
              <Button variant="outline" size="sm" onClick={() => addSet(e.id)}>
                + Add set
              </Button>
            </div>

            <div className="mt-3">
              <Label className="text-xs">Notes</Label>
              <Input
                placeholder="How did it feel?"
                value={f.notes}
                onChange={(ev) =>
                  setForms((prev) => ({
                    ...prev,
                    [e.id]: {
                      ...(prev[e.id] ?? { sets: [], notes: "" }),
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
