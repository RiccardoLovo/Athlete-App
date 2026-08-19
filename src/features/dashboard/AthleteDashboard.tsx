import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Dumbbell,
  Download,
  UserCircle,
  Plus,
  X,
  PlayCircle,
} from "lucide-react";
import { ClientProfileDialog } from "@/components/coachdesk/ClientProfileDialog";
import {
  ExerciseBank,
  insertExerciseIntoSession,
} from "@/components/coachdesk/ExerciseBank";
import { SessionExercises } from "@/components/coachdesk/SessionExercises";
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
  addDays,
  parseISODate,
  toISODate,
} from "@/lib/coachdesk/periodization";
import { getEmbedUrl } from "@/lib/coachdesk/video";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [showProfile, setShowProfile] = useState(false);
  const [addingExtra, setAddingExtra] = useState(false);

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

  // Start-of-week offset (days) for the currently selected week, used to
  // resolve each session's real calendar date for the logging screen.
  const weekStartOffsetDays = weekOffset * 7;

  const sessionsWithExs = (data?.sessions ?? [])
    .map((s: any) => {
      const dayLabel = DAY_LABELS_LOCAL[(s.day_of_week ?? 1) - 1];
      const plannedDate = plan
        ? toISODate(
            addDays(
              parseISODate(plan.start_date),
              weekStartOffsetDays + ((s.day_of_week ?? 1) - 1),
            ),
          )
        : toISODate(new Date());
      return {
        ...s,
        exs: data!.exs.filter((e: any) => e.session_id === s.id),
        day_label: dayLabel,
        planned_date: plannedDate,
      };
    })
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Hi, {client.name} 👋</h1>
            <p className="text-sm text-muted-foreground">
              Your training for this week
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowProfile(true)}
            >
              <UserCircle className="mr-1 h-4 w-4" /> My Profile
            </Button>
            {weekInfo && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddingExtra(true)}
              >
                <Plus className="mr-1 h-4 w-4" /> Log Extra Session
              </Button>
            )}
          </div>
        </div>
        {addingExtra && weekInfo && (
          <LogExtraSession
            client={client}
            blockId={weekInfo.block.id}
            weekNumber={weekInfo.weekInBlock}
            onDone={(session) => {
              setAddingExtra(false);
              onPick(session);
            }}
            onCancel={() => setAddingExtra(false)}
          />
        )}
        {showProfile && (
          <ClientProfileDialog
            clientId={client.id}
            coachId={client.coach_id}
            clientName={client.name}
            onClose={() => setShowProfile(false)}
          />
        )}
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
              return (
                <Card
                  key={s.id}
                  className={`p-4 cursor-pointer hover:shadow ${done ? "border-emerald-300 bg-emerald-50/50" : ""}`}
                >
                  <div
                    className="flex items-center gap-2"
                    onClick={() => onPick(s)}
                  >
                    <span className="font-semibold">
                      {s.name || s.day_label}
                    </span>
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
                    onClick={() => onPick(s)}
                  >
                    {s.exs.length} exercises
                  </div>
                  <div
                    className="mt-2 flex flex-wrap gap-1"
                    onClick={() => onPick(s)}
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

const EXTRA_SESSION_DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function LogExtraSession({
  client,
  blockId,
  weekNumber,
  onDone,
  onCancel,
}: {
  client: Client;
  blockId: string;
  weekNumber: number;
  onDone: (session: {
    id: string;
    day_label: string;
    name: string | null;
    day_of_week: number;
    week_number: number;
    planned_date: string;
  }) => void;
  onCancel: () => void;
}) {
  const [day, setDay] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [exerciseCount, setExerciseCount] = useState(0);
  const [selectedExercise, setSelectedExercise] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();

  async function pickDay(d: number) {
    setCreating(true);
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        block_id: blockId,
        week_number: weekNumber,
        day_of_week: d,
        status: "active",
        is_client_added: true,
      })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error(error?.message ?? "Couldn't start this session");
      return;
    }
    setDay(d);
    setSessionId(data.id);
  }

  async function cancel() {
    if (sessionId) await supabase.from("sessions").delete().eq("id", sessionId);
    onCancel();
  }

  async function addExercise(exerciseId: string) {
    const { error } = await insertExerciseIntoSession(sessionId!, exerciseId);
    if (error) return toast.error(`Add failed: ${error.message}`);
    setExerciseCount((c) => c + 1);
    setSelectedExercise(null);
    qc.invalidateQueries({ queryKey: ["session-exs", sessionId] });
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Log an extra session</h2>
        <Button variant="ghost" size="icon" onClick={cancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {day === null ? (
        <div className="mt-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Which day did you train?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {EXTRA_SESSION_DAY_LABELS.map((label, idx) => (
              <Button
                key={label}
                variant="outline"
                size="sm"
                disabled={creating}
                onClick={() => pickDay(idx + 1)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            {EXTRA_SESSION_DAY_LABELS[day - 1]} — add what you did below, then
            log it like any other workout.
          </p>
          <div className="max-h-64 overflow-auto rounded border">
            <ExerciseBank
              selectedExerciseId={selectedExercise?.id ?? null}
              onSelectExercise={(e) => {
                setSelectedExercise(e);
                addExercise(e.id);
              }}
            />
          </div>
          <SessionExercises
            sessionId={sessionId!}
            clientId={client.id}
            compact
          />
          <Button
            className="w-full"
            disabled={exerciseCount === 0}
            onClick={() =>
              onDone({
                id: sessionId!,
                day_label: EXTRA_SESSION_DAY_LABELS[day - 1],
                name: null,
                day_of_week: day,
                week_number: weekNumber,
                planned_date: toISODate(new Date()),
              })
            }
          >
            Continue to log feedback
          </Button>
        </div>
      )}
    </Card>
  );
}

type SetEntry = { weight: string; reps: string };
type ExForm = { sets: SetEntry[]; notes: string };

const AUTOSAVE_DELAY_MS = 900;

// Single logging screen used whether the athlete opens it before, during,
// or after training: every field auto-saves (draft status) so closing the
// app mid-set never loses progress, and "Finish Workout" just flips the
// log's status to "pending" so it enters the coach's review queue. There is
// no separate live/post-hoc mode — same screen, same data, any time.
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

  const { data: existingLog } = useQuery({
    queryKey: ["my-workout-log", session.id, client.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("workout_logs")
        .select("id, borg_scale, overall_notes, performed_at, status")
        .eq("session_id", session.id)
        .eq("client_id", client.id)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: exsData } = useQuery({
    queryKey: ["my-session-exs", session.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("session_exercises")
        .select(
          "id, sets, reps, load_value, load_mode, exercises(name_en, video_url)",
        )
        .eq("session_id", session.id)
        .order("order_index");
      return (data ?? []) as any[];
    },
  });
  const exs = exsData ?? EMPTY_EXS;

  const { data: existingExLogsData } = useQuery({
    queryKey: ["my-fb-ex-logs", existingLog?.id],
    enabled: !!existingLog?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("exercise_logs")
        .select(
          "id, session_exercise_id, weight_done, reps_done, notes, sets_json",
        )
        .eq("workout_log_id", existingLog!.id);
      return (data ?? []) as any[];
    },
  });
  const existingExLogs = existingExLogsData ?? EMPTY_EXS;

  const [borg, setBorg] = useState(5);
  const [overall, setOverall] = useState("");
  const [performedAt, setPerformedAt] = useState<string>(session.planned_date);
  const [forms, setForms] = useState<Record<string, ExForm>>({});
  const [finished, setFinished] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  const hydratedRef = useRef(false);
  const skipNextAutoSaveRef = useRef(false);
  const logIdRef = useRef<string | null>(null);
  const [watchUrl, setWatchUrl] = useState<string | null>(null);

  function watchVideo(url: string) {
    const embed = getEmbedUrl(url);
    if (embed) setWatchUrl(embed);
    else window.open(url, "_blank", "noopener,noreferrer");
  }

  // Hydrate once: wait for exercises + the existing log (if any) + its
  // per-set data to all resolve, then seed all form state from them.
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!exsData) return;
    if (existingLog === undefined) return;
    if (existingLog?.id && existingExLogsData === undefined) return;
    hydratedRef.current = true;
    logIdRef.current = existingLog?.id ?? null;
    setBorg(existingLog?.borg_scale ?? 5);
    setOverall(existingLog?.overall_notes ?? "");
    setPerformedAt(existingLog?.performed_at ?? session.planned_date);
    setFinished(!!existingLog && existingLog.status !== "draft");

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
    // The state updates above will re-trigger the autosave effect once —
    // that run is hydration settling, not a real edit, so skip it.
    skipNextAutoSaveRef.current = true;
  }, [
    exsData,
    existingLog,
    existingExLogsData,
    exs,
    existingExLogs,
    session.planned_date,
  ]);

  async function save(opts?: { finish?: boolean; silent?: boolean }) {
    if (!hydratedRef.current) return;
    setSaveState("saving");
    try {
      let logId = logIdRef.current;
      const nextStatus = opts?.finish
        ? "pending"
        : finished
          ? "pending"
          : "draft";
      if (logId) {
        const { error } = await supabase
          .from("workout_logs")
          .update({
            borg_scale: borg,
            overall_notes: overall,
            performed_at: performedAt,
            status: nextStatus,
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
            performed_at: performedAt,
            status: nextStatus,
          })
          .select()
          .single();
        if (error || !log) throw error ?? new Error("Failed to save");
        logId = log.id;
        logIdRef.current = logId;
      }
      await supabase
        .from("exercise_logs")
        .delete()
        .eq("workout_log_id", logId!);
      const rows = exs.map((e: any) => {
        const f = forms[e.id] ?? { sets: [], notes: "" };
        return {
          workout_log_id: logId!,
          session_exercise_id: e.id,
          weight_done: f.sets.map((s) => s.weight).join(" / "),
          reps_done: f.sets.map((s) => s.reps).join(" / "),
          notes: f.notes ?? "",
          sets_json: f.sets,
        };
      });
      if (rows.length) {
        const { error } = await supabase.from("exercise_logs").insert(rows);
        if (error) throw error;
      }
      setSaveState("saved");
      qc.invalidateQueries({ queryKey: ["athlete-week"] });
      if (opts?.finish) {
        setFinished(true);
        toast.success("Workout finished — nice work 💪");
        qc.invalidateQueries({ queryKey: ["my-past-sessions"] });
        qc.invalidateQueries({ queryKey: ["workout-logs"] });
        qc.invalidateQueries({ queryKey: ["pending-feedback-count"] });
        qc.invalidateQueries({ queryKey: ["clients-training-status"] });
      }
    } catch (err: any) {
      setSaveState("idle");
      if (!opts?.silent) toast.error(err?.message ?? "Failed to save");
    }
  }

  // Debounced auto-save: fires on any change to borg/notes/date/sets once
  // hydrated, skipping the one run that fires right after hydration itself.
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }
    const t = setTimeout(() => void save({ silent: true }), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borg, overall, performedAt, JSON.stringify(forms)]);

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

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="flex-1 text-xl font-bold">
            {session.name || session.day_label}
          </h1>
          <span className="text-xs text-muted-foreground">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : ""}
          </span>
          {finished && (
            <Badge className="bg-emerald-100 text-emerald-800">Finished</Badge>
          )}
        </div>

        <Card className="p-4">
          <Label className="text-sm font-semibold">Date performed</Label>
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="date"
              value={performedAt}
              max={toISODate(new Date())}
              onChange={(e) => setPerformedAt(e.target.value)}
              className="h-11 w-auto text-base"
            />
          </div>
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
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  {i + 1}. {e.exercises?.name_en}
                  {e.exercises?.video_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-primary"
                      title="Watch demo"
                      onClick={() => watchVideo(e.exercises.video_url)}
                    >
                      <PlayCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {e.sets ?? "-"}×{e.reps || "-"}
                  {e.load_value != null && ` @ ${e.load_value}${weightSuffix}`}
                  {e.load_mode === "bodyweight" && " · bodyweight"}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-8">Set</span>
                  <span>
                    Weight{weightSuffix ? ` (${weightSuffix.trim()})` : ""}
                  </span>
                  <span>Reps</span>
                  <span className="w-9" />
                </div>
                {f.sets.map((s, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2"
                  >
                    <span className="w-8 text-sm font-medium text-muted-foreground">
                      #{idx + 1}
                    </span>
                    <Input
                      inputMode="decimal"
                      className="h-11 text-base"
                      value={s.weight}
                      onChange={(ev) =>
                        updateSet(e.id, idx, { weight: ev.target.value })
                      }
                    />
                    <Input
                      inputMode="numeric"
                      className="h-11 text-base"
                      value={s.reps}
                      onChange={(ev) =>
                        updateSet(e.id, idx, { reps: ev.target.value })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => removeSet(e.id, idx)}
                      disabled={f.sets.length <= 1}
                      aria-label="Remove set"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => addSet(e.id)}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add set
                </Button>
              </div>

              <div className="mt-3">
                <Label className="text-xs">Notes</Label>
                <Input
                  placeholder="How did it feel?"
                  className="h-11 text-base"
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

        {finished ? (
          <p className="text-center text-xs text-muted-foreground">
            Workout finished — you can still edit anything above, changes save
            automatically.
          </p>
        ) : (
          <Button
            className="h-12 w-full text-base"
            size="lg"
            onClick={() => save({ finish: true })}
          >
            Finish Workout
          </Button>
        )}
      </div>

      <Dialog open={!!watchUrl} onOpenChange={(o) => !o && setWatchUrl(null)}>
        <DialogContent className="max-w-2xl p-2">
          <DialogHeader className="px-2 pt-1">
            <DialogTitle>Exercise demo</DialogTitle>
          </DialogHeader>
          {watchUrl && (
            <div className="aspect-video w-full overflow-hidden rounded-md">
              <iframe
                src={watchUrl}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
