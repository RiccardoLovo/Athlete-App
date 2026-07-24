import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Dumbbell, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { BORG_LABELS, borgColor } from "@/lib/coachdesk/constants";
import { useRole } from "@/hooks/use-role";
import { downloadTrainingPdf } from "@/lib/coachdesk/download-training-pdf";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type Client = { id: string; name: string; sport: string; coach_id: string };

const EMPTY_EXS: any[] = [];

export function AthleteDashboard() {
  const navigate = useNavigate();
  const { data: role, isLoading: roleLoading } = useRole();
  const [session, setSession] = useState<any | null>(null);

  useEffect(() => {
    if (!roleLoading && role && !role.isAthlete && !role.hasClientProfile) {
      navigate({ to: "/exercises", replace: true });
    }
  }, [role, roleLoading, navigate]);

  const { data: client, isLoading } = useQuery({
    queryKey: ["my-client"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("clients")
        .select("id, name, sport, coach_id")
        .eq("user_id", u.user.id)
        .maybeSingle();
      return data as Client | null;
    },
  });

  if (isLoading || roleLoading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center px-4">
        <Card className="max-w-md p-8 text-center">
          <h2 className="text-xl font-bold">No training plan yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your coach hasn't set you up yet. Check back soon.
          </p>
        </Card>
      </div>
    );
  }

  if (session)
    return (
      <LogWorkout
        client={client}
        session={session}
        onBack={() => setSession(null)}
      />
    );
  return <SessionList client={client} onPick={setSession} />;
}

function SessionList({
  client,
  onPick,
}: {
  client: Client;
  onPick: (s: any) => void;
}) {
  const DAY_LABELS_LOCAL = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const { data: plan } = useQuery({
    queryKey: ["athlete-active-plan", client.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_plans")
        .select(
          "id, name, start_date, status, training_blocks(id, name, position, weeks)",
        )
        .eq("athlete_id", client.id)
        .eq("status", "active")
        .maybeSingle();
      return data as any;
    },
  });
  const blocks = (plan?.training_blocks ?? [])
    .slice()
    .sort((a: any, b: any) => a.position - b.position);
  const totalWeeks = blocks.reduce((s: number, b: any) => s + b.weeks, 0);
  const [weekOffset, setWeekOffset] = useState(0); // 0..totalWeeks-1 across whole plan
  const [downloading, setDownloading] = useState(false);

  // Resolve current week info
  const weekInfo = (() => {
    if (!plan || !blocks.length) return null;
    let remaining = weekOffset;
    for (const b of blocks) {
      if (remaining < b.weeks) return { block: b, weekInBlock: remaining + 1 };
      remaining -= b.weeks;
    }
    return null;
  })();

  const { data } = useQuery({
    queryKey: ["athlete-week", weekInfo?.block?.id, weekInfo?.weekInBlock],
    enabled: !!weekInfo,
    queryFn: async () => {
      const { data: sessions } = await supabase
        .from("sessions")
        .select("*")
        .eq("block_id", weekInfo!.block.id)
        .eq("week_number", weekInfo!.weekInBlock)
        .eq("status", "active")
        .order("day_of_week");
      const ids = (sessions ?? []).map((s) => s.id);
      const { data: exs } = ids.length
        ? await supabase
            .from("session_exercises")
            .select("id, session_id, exercises(name_en)")
            .in("session_id", ids)
        : { data: [] };
      const { data: logs } = ids.length
        ? await supabase
            .from("workout_logs")
            .select("session_id")
            .eq("client_id", client.id)
            .in("session_id", ids)
        : { data: [] };
      return {
        sessions: sessions ?? [],
        exs: (exs ?? []) as any[],
        logged: new Set((logs ?? []).map((l: any) => l.session_id)),
      };
    },
  });

  const sessionsWithExs = (data?.sessions ?? [])
    .map((s: any) => ({
      ...s,
      exs: data!.exs.filter((e: any) => e.session_id === s.id),
    }))
    .filter((s) => s.exs.length > 0);

  async function handleDownload(
    scope: "day" | "week" | "block",
    opts: { block: any; weekInBlock?: number; sessionId?: string },
  ) {
    if (!plan) return;
    try {
      setDownloading(true);
      await downloadTrainingPdf({
        scope,
        clientId: client.id,
        clientName: client.name,
        sport: client.sport ?? "",
        blockId: opts.block.id,
        blockName: opts.block.name,
        weeksTotal: opts.block.weeks,
        weekNumber: opts.weekInBlock,
        sessionId: opts.sessionId,
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate PDF");
    } finally {
      setDownloading(false);
    }
  }

  // Compute the global offset of the first week of each block, so the
  // W-button onClick selects the right slot in the cross-plan offset.
  let runningOffset = 0;
  const blockSections = blocks.map((b: any) => {
    const startOffset = runningOffset;
    runningOffset += b.weeks;
    return { block: b, startOffset };
  });

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <div>
          <h1 className="text-2xl font-bold">Hi, {client.name} 👋</h1>
          <p className="text-sm text-muted-foreground">
            Your training for this week
          </p>
        </div>
        <div className="space-y-2">
          {blockSections.map(({ block, startOffset }: any, idx: number) => {
            const isCurrentBlock = weekInfo?.block?.id === block.id;
            return (
              <Card
                key={block.id}
                className={`p-3 ${isCurrentBlock ? "border-primary/60 bg-primary/5" : ""}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Badge
                    variant={isCurrentBlock ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    Block {idx + 1}
                  </Badge>
                  <span className="truncate text-sm font-semibold">
                    {block.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    · {block.weeks}w
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto"
                        disabled={downloading}
                      >
                        <Download className="mr-1 h-4 w-4" /> PDF
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isCurrentBlock && weekInfo && (
                        <DropdownMenuItem
                          onClick={() =>
                            handleDownload("week", {
                              block,
                              weekInBlock: weekInfo.weekInBlock,
                            })
                          }
                        >
                          Current week (W{weekInfo.weekInBlock})
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => handleDownload("block", { block })}
                      >
                        Whole block ({block.weeks} weeks)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: block.weeks }, (_, i) => i).map((i) => {
                    const globalIdx = startOffset + i;
                    return (
                      <Button
                        key={i}
                        size="sm"
                        variant={
                          globalIdx === weekOffset ? "default" : "outline"
                        }
                        onClick={() => setWeekOffset(globalIdx)}
                      >
                        W{i + 1}
                      </Button>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
        {sessionsWithExs.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Dumbbell className="mx-auto mb-2 h-10 w-10 opacity-40" />
            No workouts in this week yet.
          </Card>
        ) : (
          <div className="space-y-2">
            {sessionsWithExs.map((s: any) => {
              const done = data!.logged.has(s.id);
              const dayLabel = DAY_LABELS_LOCAL[(s.day_of_week ?? 1) - 1];
              return (
                <Card
                  key={s.id}
                  className={`p-4 ${done ? "cursor-not-allowed border-emerald-300 bg-emerald-50/50" : "cursor-pointer hover:shadow"}`}
                >
                  <div
                    className="flex items-center gap-2"
                    onClick={() =>
                      !done && onPick({ id: s.id, day_label: dayLabel })
                    }
                  >
                    <span className="font-semibold">{s.name || dayLabel}</span>
                    {s.is_optional && (
                      <Badge className="bg-yellow-100 text-yellow-800">
                        Optional
                      </Badge>
                    )}
                    {done && (
                      <Check className="ml-auto h-5 w-5 text-emerald-600" />
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className={done ? "ml-2" : "ml-auto"}
                      title="Download this day as PDF"
                      disabled={downloading}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (weekInfo)
                          handleDownload("day", {
                            block: weekInfo.block,
                            weekInBlock: weekInfo.weekInBlock,
                            sessionId: s.id,
                          });
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                  <div
                    className="mt-1 text-xs text-muted-foreground"
                    onClick={() =>
                      !done && onPick({ id: s.id, day_label: dayLabel })
                    }
                  >
                    {s.exs.length} exercises
                  </div>
                  <div
                    className="mt-2 flex flex-wrap gap-1"
                    onClick={() =>
                      !done && onPick({ id: s.id, day_label: dayLabel })
                    }
                  >
                    {s.exs.slice(0, 4).map((e: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px]">
                        {e.exercises?.name_en}
                      </Badge>
                    ))}
                    {s.exs.length > 4 && (
                      <Badge variant="outline" className="text-[10px]">
                        +{s.exs.length - 4}
                      </Badge>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function LogWorkout({
  client,
  session,
  onBack,
}: {
  client: Client;
  session: any;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [borg, setBorg] = useState(5);
  const [overall, setOverall] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: exsData } = useQuery({
    queryKey: ["my-session-exs", session.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("session_exercises")
        .select("*, exercises(name_en)")
        .eq("session_id", session.id)
        .order("order_index");
      return data ?? [];
    },
  });
  const exs = exsData ?? EMPTY_EXS;

  const [forms, setForms] = useState<
    Record<string, { weight: string; reps: string; notes: string }>
  >({});
  useEffect(() => {
    const init: typeof forms = {};
    for (const e of exs as any[]) {
      const w = e.load_value != null ? String(e.load_value) : "";
      init[e.id] = { weight: w, reps: e.reps ?? "", notes: "" };
    }
    setForms(init);
  }, [exsData]);

  async function submit() {
    const { data: log, error } = await supabase
      .from("workout_logs")
      .insert({
        session_id: session.id,
        client_id: client.id,
        coach_id: client.coach_id,
        borg_scale: borg,
        overall_notes: overall,
        status: "pending",
      })
      .select()
      .single();
    if (error || !log) return toast.error(error?.message ?? "Failed");
    const rows = (exs as any[]).map((e) => ({
      workout_log_id: log.id,
      session_exercise_id: e.id,
      weight_done: forms[e.id]?.weight ?? "",
      reps_done: forms[e.id]?.reps ?? "",
      notes: forms[e.id]?.notes ?? "",
    }));
    if (rows.length) await supabase.from("exercise_logs").insert(rows);
    qc.invalidateQueries({ queryKey: ["my-week"] });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center px-4">
        <Card className="max-w-md p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="mt-4 text-xl font-bold">Workout Logged! 💪</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your coach will be notified.
          </p>
          <Button className="mt-6 w-full" onClick={onBack}>
            Back to Training
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">
            {session.day_label} — Log Workout
          </h1>
        </div>
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
        {(exs as any[]).map((e, i) => (
          <Card key={e.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="font-semibold">
                {i + 1}. {e.exercises?.name_en}
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {e.sets ?? "-"}×{e.reps || "-"}
                {e.load_value != null &&
                  ` @ ${e.load_value}${e.load_mode === "%1RM" ? "% 1RM" : e.load_mode === "bodyweight" ? "" : "kg"}`}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Weight Done</Label>
                <Input
                  value={forms[e.id]?.weight ?? ""}
                  onChange={(ev) =>
                    setForms({
                      ...forms,
                      [e.id]: { ...forms[e.id], weight: ev.target.value },
                    })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Reps Done</Label>
                <Input
                  value={forms[e.id]?.reps ?? ""}
                  onChange={(ev) =>
                    setForms({
                      ...forms,
                      [e.id]: { ...forms[e.id], reps: ev.target.value },
                    })
                  }
                />
              </div>
            </div>
            <div className="mt-2">
              <Label className="text-xs">Notes</Label>
              <Input
                placeholder="How did it feel?"
                value={forms[e.id]?.notes ?? ""}
                onChange={(ev) =>
                  setForms({
                    ...forms,
                    [e.id]: { ...forms[e.id], notes: ev.target.value },
                  })
                }
              />
            </div>
          </Card>
        ))}
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
        <Button className="w-full" size="lg" onClick={submit}>
          Submit Workout Log
        </Button>
      </div>
    </div>
  );
}
