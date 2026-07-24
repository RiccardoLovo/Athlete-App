import { supabase } from "@/integrations/supabase/client";
import { exportTrainingPdf, type TrainingPdfScope, type PdfExercise, type PdfInterval } from "./pdf";
import { summarizePrescription, type Discipline } from "./prescription";

export async function downloadTrainingPdf(opts: {
  scope: TrainingPdfScope;
  clientId: string;
  clientName: string;
  sport: string;
  blockId: string;
  blockName?: string;
  weeksTotal?: number; // required for "block"
  weekNumber?: number; // required for "week" and "day"
  sessionId?: string;  // required for "day"
}) {
  const weekNumbers: number[] =
    opts.scope === "block"
      ? Array.from({ length: Math.max(1, opts.weeksTotal ?? 1) }, (_, i) => i + 1)
      : [opts.weekNumber!];

  let sessQ = supabase
    .from("sessions")
    .select("id, name, day_of_week, week_number")
    .eq("block_id", opts.blockId)
    .eq("status", "active")
    .in("week_number", weekNumbers);
  if (opts.scope === "day") sessQ = sessQ.eq("id", opts.sessionId!);

  const { data: sessions } = await sessQ;
  const sessRows = (sessions ?? []) as Array<{
    id: string;
    name: string | null;
    day_of_week: number;
    week_number: number;
  }>;
  const sessionIds = sessRows.map((s) => s.id);

  const { data: exs } = sessionIds.length
    ? await supabase
        .from("session_exercises")
        .select("*, exercises(name_en, discipline, structure_type)")
        .in("session_id", sessionIds)
    : { data: [] as any[] };

  const exerciseRowIds: string[] = ((exs ?? []) as any[]).map((e) => e.id);
  const { data: intervals } = exerciseRowIds.length
    ? await supabase
        .from("prescription_intervals")
        .select("*")
        .in("session_exercise_id", exerciseRowIds)
        .order("order_index")
    : { data: [] as any[] };
  const intervalsBySE = new Map<string, PdfInterval[]>();
  for (const r of (intervals ?? []) as any[]) {
    const arr = intervalsBySE.get(r.session_exercise_id) ?? [];
    arr.push({
      label: r.label ?? null,
      target_value: r.target_value == null ? null : Number(r.target_value),
      target_unit: (r.target_unit ?? "meters") as PdfInterval["target_unit"],
      pace_per_km: r.pace_per_km ?? null,
      hr_zone: r.hr_zone ?? null,
      watts: r.watts ?? null,
      cadence: r.cadence ?? null,
      stroke: r.stroke ?? null,
      intensity: r.intensity ?? null,
      rest_seconds: r.rest_seconds ?? null,
      rest_type: r.rest_type ?? null,
    });
    intervalsBySE.set(r.session_exercise_id, arr);
  }

  const { data: oneRms } = await supabase
    .from("client_exercise_1rm")
    .select("exercise_id, value_kg, tested_date")
    .eq("client_id", opts.clientId)
    .order("tested_date", { ascending: false });
  const rmMap = new Map<string, number>();
  for (const r of (oneRms ?? []) as any[]) {
    if (!rmMap.has(r.exercise_id)) rmMap.set(r.exercise_id, Number(r.value_kg));
  }

  const buildExercise = (e: any): PdfExercise => {
    const discipline = (e.exercises?.discipline ?? "Strength") as Discipline;
    const structure = (e.exercises?.structure_type ?? "simple") as PdfExercise["structure_type"];
    const oneRm = rmMap.get(e.exercise_id) ?? null;
    let load_label = "";
    if (e.load_mode === "bodyweight") load_label = "BW";
    else if (e.load_value != null) {
      if (e.load_mode === "%1RM") {
        const abs = oneRm ? Math.round((Number(e.load_value) / 100) * oneRm * 10) / 10 : null;
        load_label = abs != null ? `${e.load_value}% (${abs}kg)` : `${e.load_value}% 1RM`;
      } else {
        load_label = `${e.load_value}kg`;
      }
    }
    return {
      name: e.exercises?.name_en ?? "Exercise",
      discipline,
      order_index: e.order_index ?? 0,
      sets: e.sets ?? null,
      reps: e.reps ?? "",
      load_label,
      rest_sec: e.rest_sec ?? null,
      tempo: e.tempo ?? "",
      rpe: e.rpe ?? null,
      notes: e.notes ?? "",
      summary: summarizePrescription(discipline, e as any, oneRm),
      intervals: intervalsBySE.get(e.id),
      structure_type: structure,
    };
  };

  const weeks = weekNumbers.map((wn) => {
    const wkSess = sessRows.filter((s) => s.week_number === wn);
    // Group sessions by day_of_week so that days with multiple sessions
    // (e.g. AM/PM) become a single day with multiple session cards.
    const byDay = new Map<number, typeof wkSess>();
    for (const s of wkSess) {
      const dn = (s.day_of_week ?? 1) - 1;
      const arr = byDay.get(dn) ?? [];
      arr.push(s);
      byDay.set(dn, arr);
    }
    const days = Array.from(byDay.entries()).map(([day_number, daySessions]) => ({
      day_number,
      sessions: daySessions.map((s) => ({
        name: s.name ?? null,
        exercises: ((exs ?? []) as any[])
          .filter((e) => e.session_id === s.id)
          .map(buildExercise),
      })),
    }));
    return { weekNumber: wn, days };
  });

  exportTrainingPdf({
    scope: opts.scope,
    clientName: opts.clientName,
    sport: opts.sport,
    blockName: opts.blockName,
    weeks,
  });
}