import { t } from "./i18n";

export type Discipline =
  | "Strength"
  | "Running"
  | "Swimming"
  | "Cycling"
  | "Sport-Specific"
  | "Mobility";

export const DISCIPLINES: Discipline[] = [
  "Strength",
  "Running",
  "Swimming",
  "Cycling",
  "Sport-Specific",
  "Mobility",
];

export const DISCIPLINE_ICON: Record<Discipline, string> = {
  Strength: "💪",
  Running: "🏃",
  Swimming: "🏊",
  Cycling: "🚴",
  "Sport-Specific": "🎾",
  Mobility: "🧘",
};

export const DISCIPLINE_BADGE: Record<Discipline, string> = {
  Strength:
    "border-orange-300 bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  Running:
    "border-emerald-300 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  Swimming:
    "border-sky-300 bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  Cycling:
    "border-amber-300 bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  "Sport-Specific":
    "border-violet-300 bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  Mobility:
    "border-teal-300 bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300",
};

// All possible prescription fields, flat.
// Top-level columns on session_exercises:
//   sets (int), reps (text), target_mode, rpe (int), load_mode, load_value (num),
//   rest_sec (int), distance_km (num), duration_min (num), pace (text),
//   hr_zone (int), tempo (text), notes (text)
// Rare/JSONB-stored fields nested under `prescription`:
//   stroke, equipment, distance_m, laps, watts, cadence_rpm, hold_sec, side, rir
export interface Prescription {
  sets: number | null;
  reps: string;
  target_mode: string | null;
  rpe: number | null;
  load_mode: string | null;
  load_value: number | null;
  rest_sec: number | null;
  distance_km: number | null;
  duration_min: number | null;
  pace: string;
  hr_zone: number | null;
  tempo: string;
  notes: string;
  prescription: Record<string, unknown>;
}

export function emptyPrescription(): Prescription {
  return {
    sets: null,
    reps: "",
    target_mode: null,
    rpe: null,
    load_mode: null,
    load_value: null,
    rest_sec: null,
    distance_km: null,
    duration_min: null,
    pace: "",
    hr_zone: null,
    tempo: "",
    notes: "",
    prescription: {},
  };
}

export function defaultForDiscipline(d: Discipline): Partial<Prescription> {
  switch (d) {
    case "Strength":
      return { sets: 3, reps: "10", load_mode: "kg", rest_sec: 60 };
    case "Running":
      return { target_mode: "Distance" };
    case "Swimming":
      return { target_mode: "Distance" };
    case "Cycling":
      return { target_mode: "Distance" };
    case "Sport-Specific":
      return { target_mode: "Time" };
    case "Mobility":
      return { target_mode: "Hold" };
  }
}

// Renders a one-line human summary for collapsed cards and the PDF.
// Only includes populated fields.
export function summarizePrescription(
  d: Discipline,
  p: Prescription,
  oneRmKg: number | null = null,
): string {
  const parts: string[] = [];
  switch (d) {
    case "Strength": {
      if (p.sets != null && p.reps) parts.push(`${p.sets}×${p.reps}`);
      else if (p.sets != null) parts.push(`${p.sets} sets`);
      else if (p.reps) parts.push(p.reps);
      if (p.load_mode === "bodyweight") parts.push("BW");
      else if (p.load_value != null) {
        if (p.load_mode === "%1RM") {
          const abs = oneRmKg
            ? Math.round((p.load_value / 100) * oneRmKg * 10) / 10
            : null;
          parts.push(
            abs != null
              ? `@ ${p.load_value}% 1RM (${abs}kg)`
              : `@ ${p.load_value}% 1RM`,
          );
        } else {
          parts.push(`@ ${p.load_value}kg`);
        }
      }
      if (p.tempo) parts.push(`Tempo: ${p.tempo}`);
      if (p.rest_sec != null) parts.push(`Rest: ${p.rest_sec}s`);
      if (p.rpe != null) parts.push(`RPE: ${p.rpe}`);
      const rir = p.prescription?.["rir"];
      if (typeof rir === "number") parts.push(`RIR: ${rir}`);
      break;
    }
    case "Running": {
      const interval = p.prescription?.["interval_reps"];
      if (p.target_mode === "Distance" && p.distance_km != null) {
        const km = p.distance_km;
        if (typeof interval === "number" && interval > 1)
          parts.push(`${Math.round(km * 1000)}m × ${interval}`);
        else parts.push(`${km}km`);
      } else if (p.target_mode === "Time" && p.duration_min != null) {
        parts.push(`${p.duration_min} min`);
      }
      if (p.pace) parts.push(`Pace: ${p.pace}/km`);
      if (p.hr_zone != null) parts.push(`HR Z${p.hr_zone}`);
      if (p.rest_sec != null) parts.push(`Rest: ${p.rest_sec}s`);
      if (p.rpe != null) parts.push(`RPE: ${p.rpe}`);
      break;
    }
    case "Swimming": {
      const stroke = p.prescription?.["stroke"];
      const equipment = p.prescription?.["equipment"];
      const laps = p.prescription?.["laps"];
      const interval = p.prescription?.["interval_reps"];
      if (p.target_mode === "Distance" && p.distance_km != null) {
        const m = Math.round(p.distance_km * 1000);
        if (typeof interval === "number" && interval > 1)
          parts.push(`${m}m × ${interval}`);
        else parts.push(`${m}m`);
      } else if (p.target_mode === "Laps" && typeof laps === "number")
        parts.push(`${laps} laps`);
      else if (p.target_mode === "Time" && p.duration_min != null)
        parts.push(`${p.duration_min} min`);
      if (typeof stroke === "string" && stroke) parts.push(stroke);
      if (p.pace) parts.push(`Pace: ${p.pace}/100m`);
      if (p.hr_zone != null) parts.push(`HR Z${p.hr_zone}`);
      if (typeof equipment === "string" && equipment && equipment !== "None")
        parts.push(`Equipment: ${equipment}`);
      if (p.rest_sec != null) parts.push(`Rest: ${p.rest_sec}s`);
      if (p.rpe != null) parts.push(`RPE: ${p.rpe}`);
      break;
    }
    case "Cycling": {
      const watts = p.prescription?.["watts"];
      const cadence = p.prescription?.["cadence_rpm"];
      const interval = p.prescription?.["interval_reps"];
      if (p.target_mode === "Distance" && p.distance_km != null)
        parts.push(`${p.distance_km}km`);
      else if (p.target_mode === "Time" && p.duration_min != null)
        parts.push(`${p.duration_min} min`);
      if (typeof interval === "number" && interval > 1)
        parts.push(`× ${interval}`);
      if (typeof watts === "number") parts.push(`${watts}W`);
      if (p.hr_zone != null) parts.push(`HR Z${p.hr_zone}`);
      if (typeof cadence === "number") parts.push(`${cadence}rpm`);
      if (p.rest_sec != null) parts.push(`Rest: ${p.rest_sec}s`);
      if (p.rpe != null) parts.push(`RPE: ${p.rpe}`);
      break;
    }
    case "Sport-Specific": {
      if (p.target_mode === "Time" && p.duration_min != null)
        parts.push(`${p.duration_min} min`);
      else if (p.target_mode === "Reps" && p.reps) parts.push(`${p.reps} reps`);
      if (p.sets != null) parts.push(`${p.sets} sets`);
      if (p.rest_sec != null) parts.push(`Rest: ${p.rest_sec}s`);
      if (p.rpe != null) parts.push(`RPE: ${p.rpe}`);
      break;
    }
    case "Mobility": {
      const hold = p.prescription?.["hold_sec"];
      const side = p.prescription?.["side"];
      if (p.target_mode === "Hold" && typeof hold === "number")
        parts.push(`Hold: ${hold}s`);
      else if (p.target_mode === "Reps" && p.reps) parts.push(`${p.reps} reps`);
      if (p.sets != null) parts.push(`× ${p.sets} sets`);
      if (typeof side === "string" && side && side !== "Both")
        parts.push(`Side: ${side}`);
      break;
    }
  }
  if (p.notes) parts.push(p.notes);
  return parts.join(" | ");
}

// Helper labels used by PDF and tooltips
export function disciplineLabel(d: Discipline): string {
  return `${DISCIPLINE_ICON[d]} ${t(`discipline.${d}`)}`;
}
