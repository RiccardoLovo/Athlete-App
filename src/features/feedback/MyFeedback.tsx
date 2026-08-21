import { useMemo, useState } from "react";
import { MessageSquare, CalendarIcon, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { borgColor, formatDistance } from "@/lib/coachdesk/constants";
import {
  parseISODate,
  toISODate,
  formatLong,
} from "@/lib/coachdesk/periodization";
import { MyFeedbackDetail } from "./MyFeedbackDetail";
import { useMyClientForFeedback, useMyPastSessions } from "./useMyPastSessions";

export function MyFeedback({ wrap }: { wrap?: boolean } = {}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"unlogged" | "all">("unlogged");

  const { data: client } = useMyClientForFeedback();
  const { data: sessions = [], isLoading } = useMyPastSessions(client?.id);

  const todayISO = toISODate(new Date());
  const due = useMemo(
    () => sessions.filter((s) => s.planned_date <= todayISO || s.log),
    [sessions, todayISO],
  );
  const unloggedCount = useMemo(() => due.filter((s) => !s.log).length, [due]);
  const visible = useMemo(() => {
    return due
      .filter((s) => (filter === "unlogged" ? !s.log : true))
      .sort((a, b) => {
        const ad = a.log?.performed_at ?? a.planned_date;
        const bd = b.log?.performed_at ?? b.planned_date;
        return bd.localeCompare(ad);
      });
  }, [due, filter]);

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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">My Feedback</h1>
            <p className="text-sm text-muted-foreground">
              Log or edit feedback on your past sessions.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={filter === "unlogged" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("unlogged")}
            >
              To log
              {unloggedCount > 0 && (
                <Badge className="ml-1.5 bg-foreground text-background">
                  {unloggedCount}
                </Badge>
              )}
            </Button>
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              All
            </Button>
          </div>
        </div>
        {isLoading ? (
          <div className="py-20 text-center text-muted-foreground">
            Loading…
          </div>
        ) : visible.length === 0 ? (
          <div className="py-20 text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-2 text-muted-foreground">
              {filter === "unlogged"
                ? "You're all caught up — nothing left to log."
                : "No past sessions yet."}
            </p>
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
