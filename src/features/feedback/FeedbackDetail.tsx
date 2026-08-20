import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react";
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

export function FeedbackDetail({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
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
        .select("*, session_exercises(*, exercises(name_en))")
        .eq("workout_log_id", id);
      return { log, exs: exs ?? [] };
    },
  });

  async function markReviewed() {
    await supabase
      .from("workout_logs")
      .update({ status: "reviewed" })
      .eq("id", id);
    toast.success("Marked as reviewed");
    onBack();
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
              <Badge className="bg-emerald-600 text-white">Reviewed</Badge>
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
            const setsStr = se?.sets != null ? String(se.sets) : "-";
            const repsStr = se?.reps || "-";
            const loadStr =
              se?.load_value != null
                ? ` @ ${se.load_value}${se.load_mode === "%1RM" ? "% 1RM" : se.load_mode === "bodyweight" ? "" : "kg"}`
                : "";
            const prescribed = `${setsStr}×${repsStr}${loadStr}`;
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
