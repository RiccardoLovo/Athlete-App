import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Check, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { borgColor, formatDistance } from "@/lib/coachdesk/constants";
import { FeedbackDetail } from "./FeedbackDetail";
import type { WorkoutLog } from "./feedback.types";

export function CoachFeedback({
  embedded,
  focusClientId,
}: {
  embedded?: boolean;
  focusClientId?: string;
} = {}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "reviewed" | "all">(
    "pending",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [consumedFocus, setConsumedFocus] = useState<string | null>(null);

  const { data: logs = [] } = useQuery({
    queryKey: ["workout-logs", filter],
    queryFn: async () => {
      let q = supabase
        .from("workout_logs")
        .select(
          "*, clients(id, name), sessions(day_of_week, week_number, name, discipline, duration_minutes, distance_meters, intensity)",
        )
        .neq("status", "draft") // athlete hasn't finished the workout yet
        .order("submitted_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as (WorkoutLog & {
        clients: { id: string; name: string };
      })[];
    },
  });

  // Deep-linked from the clients list bell: jump straight to that client's
  // most recent pending feedback the first time it becomes available.
  useEffect(() => {
    if (!focusClientId || focusClientId === consumedFocus) return;
    const match = logs.find((l) => l.clients.id === focusClientId);
    if (match) {
      setSelectedId(match.id);
      setConsumedFocus(focusClientId);
    }
  }, [focusClientId, consumedFocus, logs]);

  const pendingCount = logs.filter((l) => l.status === "pending").length;

  if (selectedId) {
    return (
      <FeedbackDetail
        id={selectedId}
        onBack={() => {
          setSelectedId(null);
          qc.invalidateQueries({ queryKey: ["workout-logs"] });
          qc.invalidateQueries({ queryKey: ["pending-feedback-count"] });
        }}
      />
    );
  }

  const inner = (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Client Feedback</h1>
        {pendingCount > 0 && (
          <Badge className="bg-red-600 text-white">
            {pendingCount} pending
          </Badge>
        )}
      </div>
      <div className="mb-4 flex gap-2">
        <Button
          variant={filter === "pending" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("pending")}
        >
          <Clock className="mr-1 h-4 w-4" /> Pending
        </Button>
        <Button
          variant={filter === "reviewed" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("reviewed")}
        >
          <Check className="mr-1 h-4 w-4" /> Reviewed
        </Button>
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          All
        </Button>
      </div>
      {logs.length === 0 ? (
        <div className="py-20 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-2 text-muted-foreground">No feedback yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((l) => (
            <Card
              key={l.id}
              className={`cursor-pointer p-4 transition hover:shadow ${l.status === "pending" ? "border-yellow-300 bg-yellow-50/40" : ""}`}
              onClick={() => setSelectedId(l.id)}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{l.clients.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {l.sessions?.name ||
                        ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
                          (l.sessions?.day_of_week ?? 1) - 1
                        ]}
                    </span>
                    <Badge variant="secondary">
                      W{l.sessions?.week_number}
                    </Badge>
                    {l.sessions?.discipline && (
                      <Badge variant="outline">
                        {[
                          l.sessions.discipline,
                          l.sessions.duration_minutes
                            ? `${l.sessions.duration_minutes} min`
                            : null,
                          formatDistance(
                            l.sessions.distance_meters,
                            l.sessions.discipline,
                          ),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Badge>
                    )}
                  </div>
                  {l.overall_notes && (
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                      {l.overall_notes}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(l.submitted_at).toLocaleString()}
                  </p>
                </div>
                <Badge className={borgColor(l.borg_scale)}>
                  {l.borg_scale}/10
                </Badge>
                {l.status === "pending" ? (
                  <Clock className="h-5 w-5 text-yellow-600" />
                ) : (
                  <Check className="h-5 w-5 text-emerald-600" />
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
  if (embedded) return inner;
  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-auto">
      <div className="mx-auto max-w-[1000px] p-6">{inner}</div>
    </div>
  );
}
