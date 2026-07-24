// English-only dictionary scaffold. Flip to IT/EN by adding a second map
// and a useLocale() hook later; all UI strings should go through t().

export type LocaleKey = "en";

const en = {
  // Common
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.delete": "Delete",
  "common.notes": "Notes",
  "common.rpe": "RPE",
  "common.rir": "RIR",
  "common.rest": "Rest",
  "common.rest_sec": "Rest (sec)",
  "common.sets": "Sets",
  "common.reps": "Reps",
  "common.tempo": "Tempo",
  "common.side": "Side",
  "common.both": "Both",
  "common.left": "Left",
  "common.right": "Right",
  "common.none": "None",

  // Disciplines
  "discipline.Strength": "Strength",
  "discipline.Running": "Running",
  "discipline.Swimming": "Swimming",
  "discipline.Cycling": "Cycling",
  "discipline.Sport-Specific": "Sport-Specific",
  "discipline.Mobility": "Mobility",

  // Target modes
  "target.Distance": "Distance",
  "target.Time": "Time",
  "target.Laps": "Laps",
  "target.Hold": "Hold",
  "target.Reps": "Reps",
  "target.mode": "Target",

  // Strength
  "strength.load_mode": "Load",
  "strength.kg": "kg",
  "strength.pct1rm": "% 1RM",
  "strength.bodyweight": "Bodyweight",
  "strength.load_value": "Value",
  "strength.tempo.placeholder": "3-1-2-0",
  "strength.no_1rm": "⚠️ No 1RM set — add it in the client's 1RM dashboard",
  "strength.pct_calc": "{pct}% of {oneRm}kg = {abs}kg",

  // Endurance / shared
  "field.distance_km": "Distance (km)",
  "field.distance_m": "Distance (m)",
  "field.duration_min": "Duration (min)",
  "field.pace_min_km": "Pace (min/km)",
  "field.pace_min_100m": "Pace (min/100m)",
  "field.hr_zone": "HR Zone",
  "field.reps_intervals": "Reps (intervals)",
  "field.laps": "Laps",
  "field.hold_sec": "Hold (sec)",
  "field.watts": "Watts",
  "field.cadence_rpm": "Cadence (rpm)",
  "field.stroke": "Stroke",
  "field.equipment": "Equipment",

  // Swim strokes & equipment
  "stroke.Freestyle": "Freestyle",
  "stroke.Backstroke": "Backstroke",
  "stroke.Breaststroke": "Breaststroke",
  "stroke.Butterfly": "Butterfly",
  "stroke.IM": "IM",
  "equip.Pull Buoy": "Pull Buoy",
  "equip.Paddles": "Paddles",
  "equip.Fins": "Fins",
  "equip.Kickboard": "Kickboard",
  "equip.None": "None",

  // Builder
  "builder.filter.discipline": "Discipline",
  "builder.bank.search": "Search…",
} as const;

const dictionaries: Record<LocaleKey, Record<string, string>> = { en };

let currentLocale: LocaleKey = "en";

export function setLocale(l: LocaleKey) { currentLocale = l; }
export function getLocale(): LocaleKey { return currentLocale; }

export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = dictionaries[currentLocale] ?? en;
  let out = (dict as Record<string, string>)[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
  return out;
}