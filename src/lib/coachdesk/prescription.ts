import { t } from "./i18n";

export type Discipline =
  | "Strength"
  | "Running"
  | "Swimming"
  | "Cycling"
  | "Football"
  | "Padel"
  | "Mobility";

export const DISCIPLINES: Discipline[] = [
  "Strength",
  "Running",
  "Swimming",
  "Cycling",
  "Football",
  "Padel",
  "Mobility",
];

export const DISCIPLINE_ICON: Record<Discipline, string> = {
  Strength: "💪",
  Running: "🏃",
  Swimming: "🏊",
  Cycling: "🚴",
  Football: "⚽",
  Padel: "🎾",
  Mobility: "🧘",
};

// Monochrome: the DISCIPLINE_ICON emoji carries the per-discipline
// distinction now, so every badge shares the same neutral treatment.
const NEUTRAL_DISCIPLINE_BADGE =
  "border-border bg-secondary text-secondary-foreground";
export const DISCIPLINE_BADGE: Record<Discipline, string> = {
  Strength: NEUTRAL_DISCIPLINE_BADGE,
  Running: NEUTRAL_DISCIPLINE_BADGE,
  Swimming: NEUTRAL_DISCIPLINE_BADGE,
  Cycling: NEUTRAL_DISCIPLINE_BADGE,
  Football: NEUTRAL_DISCIPLINE_BADGE,
  Padel: NEUTRAL_DISCIPLINE_BADGE,
  Mobility: NEUTRAL_DISCIPLINE_BADGE,
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
    case "Football":
    case "Padel":
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
      else if (p.target_mode === "Time" && p.duration_min != null) {
        parts.push(`${p.duration_min} min`);
      }
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
    case "Football":
    case "Padel": {
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

const INTERVAL_UNIT_ABBREV: Record<string, string> = {
  meters: "m",
  seconds: "s",
  minutes: "min",
};

export interface IntervalRoundLike {
  target_value: number | null;
  target_unit: string;
  rest_seconds: number | null;
}

// Collapses a round-by-round interval prescription into a compact human
// summary, e.g. 10 identical 20s-on/20s-off rounds -> "10 × 20s (rest 20s)".
// Runs of identical rounds collapse together; differing rounds stay listed
// separately so a varied set (600m easy, 800m moderate, ...) stays readable.
export function summarizeIntervals(rows: IntervalRoundLike[]): string {
  if (!rows.length) return "";
  type Group = {
    value: number | null;
    unit: string;
    rest: number | null;
    count: number;
  };
  const groups: Group[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.value === r.target_value &&
      last.unit === r.target_unit &&
      last.rest === r.rest_seconds
    ) {
      last.count++;
    } else {
      groups.push({
        value: r.target_value,
        unit: r.target_unit,
        rest: r.rest_seconds,
        count: 1,
      });
    }
  }
  return groups
    .map((g) => {
      const unit = INTERVAL_UNIT_ABBREV[g.unit] ?? g.unit;
      const value = g.value != null ? `${g.value}${unit}` : "?";
      const base = g.count > 1 ? `${g.count} × ${value}` : value;
      return g.rest != null ? `${base} (rest ${g.rest}s)` : base;
    })
    .join(" + ");
}

// Build a Prescription object from a raw DB row (lossy fields default to empty).
export function rowToPrescription(row: Record<string, unknown>): Prescription {
  const get = <T>(k: string): T | null =>
    (row[k] as T | null | undefined) ?? null;
  return {
    ...emptyPrescription(),
    sets: get<number>("sets"),
    reps: get<string>("reps") ?? "",
    target_mode: get<string>("target_mode"),
    rpe: get<number>("rpe"),
    load_mode: get<string>("load_mode"),
    load_value: get<number>("load_value"),
    rest_sec: get<number>("rest_sec"),
    distance_km: get<number>("distance_km"),
    duration_min: get<number>("duration_min"),
    pace: get<string>("pace") ?? "",
    hr_zone: get<number>("hr_zone"),
    tempo: get<string>("tempo") ?? "",
    notes: get<string>("notes") ?? "",
    prescription: get<Record<string, unknown>>("prescription") ?? {},
  };
}
