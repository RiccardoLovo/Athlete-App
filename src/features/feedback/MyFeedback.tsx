import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, CalendarIcon, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { borgColor, formatDistance } from "@/lib/coachdesk/constants";
import {
  addDays,
  parseISODate,
  toISODate,
  formatLong,
} from "@/lib/coachdesk/periodization";
import { MyFeedbackDetail } from "./MyFeedbackDetail";
import type { PlanSession } from "./feedback.types";

export function MyFeedback({ wrap }: { wrap?: boolean } = {}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: client } = useQuery({
    queryKey: ["my-client-for-feedback"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("clients")
        .select("id, name, coach_id")
        .eq("user_id", u.user.id)
        .maybeSingle();
      return data as { id: string; name: string; coach_id: string } | null;
    },
  });

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["my-past-sessions", client?.id],
    enabled: !!client?.id,
    queryFn: async (): Promise<PlanSession[]> => {
      const { data: plans } = await supabase
        .from("training_plans")
        .select(
          "id, start_date, status, training_blocks(id, name, position, weeks)",
        )
        .eq("athlete_id", client!.id);
      const rows: PlanSession[] = [];
      for (const plan of (plans ?? []) as any[]) {
        const blocks = (plan.training_blocks ?? [])
          .slice()
          .sort((a: any, b: any) => a.position - b.position);
        if (!blocks.length) continue;
        const blockIds = blocks.map((b: any) => b.id);
        const { data: sess } = await supabase
          .from("sessions")
          .select(
            "id, name, day_of_week, week_number, block_id, status, is_client_added, discipline, intensity, duration_minutes, distance_meters",
          )
          .in("block_id", blockIds)
          .eq("status", "active");
        const sList = (sess ?? []) as any[];
        if (!sList.length) continue;
        const sIds = sList.map((s) => s.id);
        const [{ data: exs }, { data: logs }] = await Promise.all([
          supabase
            .from("session_exercises")
            .select("session_id, exercises(discipline, category)")
            .in("session_id", sIds),
          supabase
            .from("workout_logs")
            .select(
              "id, session_id, borg_scale, overall_notes, submitted_at, performed_at, status",
            )
            .eq("client_id", client!.id)
            .in("session_id", sIds),
        ]);
        const counts = new Map<string, number>();
        const typesMap = new Map<string, Set<string>>();
        for (const e of (exs ?? []) as any[]) {
          counts.set(e.session_id, (counts.get(e.session_id) ?? 0) + 1);
          const disc = e.exercises?.discipline as string | undefined;
          const cat = e.exercises?.category as string | undefined;
          const t = disc && disc !== "General" ? disc : cat;
          if (t) {
            if (!typesMap.has(e.session_id))
              typesMap.set(e.session_id, new Set());
            typesMap.get(e.session_id)!.add(t);
          }
        }
        const logMap = new Map<string, any>();
        for (const l of (logs ?? []) as any[]) logMap.set(l.session_id, l);

        // Block offsets in days from plan.start_date
        const offsets = new Map<string, number>();
        let cum = 0;
        for (const b of blocks) {
          offsets.set(b.id, cum);
          cum += b.weeks * 7;
        }

        for (const s of sList) {
          const c = counts.get(s.id) ?? 0;
          if (c === 0 && !s.is_client_added) continue;
          const blk = blocks.find((b: any) => b.id === s.block_id);
          if (!blk) continue;
          const off =
            (offsets.get(s.block_id) ?? 0) +
            (s.week_number - 1) * 7 +
            (s.day_of_week - 1);
          const planned = toISODate(
            addDays(parseISODate(plan.start_date), off),
          );
          let types = Array.from(typesMap.get(s.id) ?? []);
          // Drop "Mobility" unless the session is exclusively mobility
          if (types.length > 1) {
            types = types.filter((t) => t.toLowerCase() !== "mobility");
          }
          rows.push({
            id: s.id,
            name: s.name,
            day_of_week: s.day_of_week,
            week_number: s.week_number,
            block_id: s.block_id,
            block_name: blk.name,
            block_position: blk.position,
            planned_date: planned,
            ex_count: c,
            types,
            is_client_added: s.is_client_added,
            discipline: s.discipline,
            intensity: s.intensity,
            duration_minutes: s.duration_minutes,
            distance_meters: s.distance_meters,
            log: logMap.get(s.id),
          });
        }
      }
      return rows;
    },
  });

  const todayISO = toISODate(new Date());
  const visible = useMemo(() => {
    return sessions
      .filter((s) => s.planned_date <= todayISO || s.log)
      .sort((a, b) => {
        const ad = a.log?.performed_at ?? a.planned_date;
        const bd = b.log?.performed_at ?? b.planned_date;
        return bd.localeCompare(ad);
      });
  }, [sessions, todayISO]);

  const content = (() => {
    if (!client) {
      return (
        <div className="py-20 text-center text-muted-foreground">
          You don't have an athlete profile linked to this account.
        </div>
      );
    }
    if (openId) {
      const s = sessions.find((x) => x.id === openId);
      if (!s)
        return (
          <div className="py-20 text-center text-muted-foreground">
            Session not found.
          </div>
        );
      return (
        <MyFeedbackDetail
          client={client}
          session={s}
          onBack={() => setOpenId(null)}
        />
      );
    }
    return (
      <>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">My Feedback</h1>
          <p className="text-sm text-muted-foreground">
            Log or edit feedback on your past sessions.
          </p>
        </div>
        {isLoading ? (
          <div className="py-20 text-center text-muted-foreground">
            Loading…
          </div>
        ) : visible.length === 0 ? (
          <div className="py-20 text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-2 text-muted-foreground">No past sessions yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((s) => {
              const logged = !!s.log;
              const label =
                s.name ||
                (s.is_client_added && s.discipline) ||
                `Training Day ${s.day_of_week} - Week ${s.week_number}`;
              const performed = s.log?.performed_at ?? null;
              const dateDisplay = formatLong(
                parseISODate(performed ?? s.planned_date),
              );
              return (
                <Card
                  key={s.id}
                  className={`cursor-pointer p-4 transition hover:shadow ${logged ? "" : "border-yellow-300 bg-yellow-50/40"}`}
                  onClick={() => setOpenId(s.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{label}</span>
                        {s.types.length > 0 ? (
                          s.types.map((t) => (
                            <Badge key={t} variant="secondary">
                              {t}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="secondary">
                            {s.is_client_added ? "Extra session" : "Training"}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <CalendarIcon className="h-3 w-3" />
                          {dateDisplay}
                          {performed && performed !== s.planned_date && (
                            <span className="text-[10px] italic">
                              (planned{" "}
                              {formatLong(parseISODate(s.planned_date))})
                            </span>
                          )}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {s.is_client_added
                          ? [
                              s.duration_minutes
                                ? `${s.duration_minutes} min`
                                : null,
                              formatDistance(s.distance_meters, s.discipline),
                              s.intensity
                                ? s.intensity[0].toUpperCase() +
                                  s.intensity.slice(1)
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Extra session"
                          : `${s.ex_count} exercise${s.ex_count === 1 ? "" : "s"}`}
                      </p>
                      {s.log?.overall_notes && (
                        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                          {s.log.overall_notes}
                        </p>
                      )}
                    </div>
                    {logged ? (
                      <>
                        <Badge className={borgColor(s.log!.borg_scale)}>
                          {s.log!.borg_scale}/10
                        </Badge>
                        <Pencil className="h-5 w-5 text-muted-foreground" />
                      </>
                    ) : (
                      <Badge variant="outline">Give feedback</Badge>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </>
    );
  })();

  if (wrap === false) return content;
  if (wrap) {
    return (
      <div className="h-[calc(100vh-3.5rem)] overflow-auto">
        <div className="mx-auto max-w-[1000px] p-4 sm:p-6">{content}</div>
      </div>
    );
  }
  return <div className="pt-1">{content}</div>;
}
