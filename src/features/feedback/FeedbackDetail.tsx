import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, TrendingUp, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  borgColor,
  BORG_LABELS,
  formatDistance,
  intensityLabel,
} from "@/lib/coachdesk/constants";
import { toast } from "sonner";
import { useState } from "react";

function loggedWeights(e: {
  sets_json: unknown;
  weight_done: string | null;
}): number[] {
  const sets = Array.isArray(e.sets_json) ? e.sets_json : null;
  if (sets?.length) {
    return (sets as { weight?: unknown }[])
      .map((s) => Number(s.weight))
      .filter((n) => Number.isFinite(n));
  }
  if (e.weight_done) {
    return e.weight_done
      .split("/")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
  }
  return [];
}

export function FeedbackDetail({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ["workout-log", id],
    queryFn: async () => {
      const { data: log } = await supabase
        .from("workout_logs")
        .select(
          "*, clients(name), sessions(day_of_week, week_number, name, discipline, duration_minutes, distance_meters, intensity)",
        )
        .eq("id", id)
        .single();
      const { data: exs } = await supabase
        .from("exercise_logs")
        .select("*, session_exercises(*, exercises(id, name_en))")
        .eq("workout_log_id", id);
      return { log, exs: exs ?? [] };
    },
  });

  const exerciseIds = Array.from(
    new Set(
      (data?.exs ?? [])
        .map((e: any) => e.session_exercises?.exercises?.id)
        .filter(Boolean),
    ),
  ) as string[];

  const { data: currentRms = [] } = useQuery({
    queryKey: ["current-1rms", data?.log?.client_id, exerciseIds.join(",")],
    enabled: !!data?.log?.client_id && exerciseIds.length > 0,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("client_exercise_1rm")
        .select("exercise_id, value_kg, tested_date")
        .eq("client_id", data?.log?.client_id as string)
        .in("exercise_id", exerciseIds)
        .order("tested_date", { ascending: false });
      return (rows ?? []) as {
        exercise_id: string;
        value_kg: number;
        tested_date: string;
      }[];
    },
  });
  const currentRmByEx = new Map<string, number>();
  for (const r of currentRms)
    if (!currentRmByEx.has(r.exercise_id))
      currentRmByEx.set(r.exercise_id, Number(r.value_kg));

  async function markReviewed() {
    await supabase
      .from("workout_logs")
      .update({ status: "reviewed" })
      .eq("id", id);
    toast.success("Marked as reviewed");
    onBack();
  }

  async function acceptOneRm(exerciseId: string, valueKg: number) {
    const coachId = (data?.log as any)?.coach_id;
    if (!coachId) return;
    const { error } = await supabase.from("client_exercise_1rm").insert({
      coach_id: coachId,
      client_id: (data?.log as any).client_id,
      exercise_id: exerciseId,
      value_kg: valueKg,
    });
    if (error) return toast.error(error.message);
    toast.success("1RM updated");
    setDismissed((prev) => new Set(prev).add(exerciseId));
    qc.invalidateQueries({ queryKey: ["current-1rms"] });
    qc.invalidateQueries({ queryKey: ["one-rms"] });
  }

  if (!data?.log) return <div className="p-6">Loading…</div>;
  const log: any = data.log;

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-auto">
      <div className="mx-auto max-w-[900px] space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">{log.clients.name}</h1>
          <span className="text-muted-foreground">
            —{" "}
            {log.sessions?.name ||
              ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
                (log.sessions?.day_of_week ?? 1) - 1
              ]}{" "}
            · W{log.sessions?.week_number}
          </span>
          <div className="ml-auto">
            {log.status === "pending" ? (
              <Button onClick={markReviewed}>
                <Check className="mr-1 h-4 w-4" /> Mark Reviewed
              </Button>
            ) : (
              <Badge className="bg-foreground text-background">Reviewed</Badge>
            )}
          </div>
        </div>

        {log.sessions?.discipline && (
          <Card className="p-5">
            <div className="text-sm text-muted-foreground">Extra session</div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="outline">{log.sessions.discipline}</Badge>
              {log.sessions.intensity && (
                <span>
                  {intensityLabel(
                    log.sessions.intensity,
                    log.sessions.discipline,
                  )}
                </span>
              )}
              {log.sessions.duration_minutes && (
                <span>{log.sessions.duration_minutes} min</span>
              )}
              {formatDistance(
                log.sessions.distance_meters,
                log.sessions.discipline,
              ) && (
                <span>
                  {formatDistance(
                    log.sessions.distance_meters,
                    log.sessions.discipline,
                  )}
                </span>
              )}
            </div>
          </Card>
        )}

        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Overall Effort</div>
          <div className="mt-2 flex items-center gap-3">
            <Badge className={`${borgColor(log.borg_scale)} text-lg`}>
              {log.borg_scale}/10
            </Badge>
            <span className="text-muted-foreground">
              {BORG_LABELS[log.borg_scale]}
            </span>
          </div>
        </Card>

        {log.overall_notes && (
          <Card className="p-5">
            <div className="text-sm font-semibold">Overall Notes</div>
            <p className="mt-1 text-sm">{log.overall_notes}</p>
          </Card>
        )}

        <div className="space-y-2">
          {data.exs.map((e: any, i: number) => {
            const se = e.session_exercises;
            const exId: string | undefined = se?.exercises?.id;
            const setsStr = se?.sets != null ? String(se.sets) : "-";
            const repsStr = se?.reps || "-";
            const loadStr =
              se?.load_value != null
                ? ` @ ${se.load_value}${se.load_mode === "%1RM" ? "% 1RM" : se.load_mode === "bodyweight" ? "" : "kg"}`
                : "";
            const prescribed = `${setsStr}×${repsStr}${loadStr}`;

            let impliedRm: number | null = null;
            let currentRm: number | null = null;
            if (se?.load_mode === "%1RM" && se.load_value && exId) {
              const weights = loggedWeights(e);
              const maxW = weights.length ? Math.max(...weights) : null;
              impliedRm =
                maxW != null
                  ? Math.round(maxW / (se.load_value / 100) / 5) * 5
                  : null;
              currentRm = currentRmByEx.get(exId) ?? null;
            }
            const showRmPrompt =
              exId &&
              impliedRm != null &&
              impliedRm !== currentRm &&
              !dismissed.has(exId);

            return (
              <Card key={e.id} className="p-4">
                <div className="font-semibold">
                  {i + 1}. {se?.exercises?.name_en ?? "Exercise"}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Prescribed
                    </div>
                    <div>{prescribed}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Weight Done
                    </div>
                    <div>{e.weight_done || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Reps Done
                    </div>
                    <div>{e.reps_done || "—"}</div>
                  </div>
                </div>
                {e.notes && (
                  <div className="mt-2 rounded border border-yellow-200 bg-yellow-50 p-2 text-sm">
                    <span className="font-semibold">Client Note:</span>{" "}
                    {e.notes}
                  </div>
                )}
                {showRmPrompt && (
                  <div className="mt-2 flex items-start justify-between gap-2 rounded border border-foreground bg-secondary p-2 text-sm text-secondary-foreground">
                    <div className="flex items-start gap-2">
                      <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        {currentRm == null ? (
                          <>
                            No 1RM on file for this exercise — this log implies
                            a 1RM of <strong>{impliedRm}kg</strong>.
                          </>
                        ) : (
                          <>
                            This log implies the 1RM changed from{" "}
                            <strong>{currentRm}kg</strong> to{" "}
                            <strong>{impliedRm}kg</strong>.
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => acceptOneRm(exId!, impliedRm!)}
                      >
                        Update 1RM
                      </Button>
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setDismissed((prev) => new Set(prev).add(exId!))
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Submitted {new Date(log.submitted_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
