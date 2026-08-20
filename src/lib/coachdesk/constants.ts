export const SPORTS = ["General", "Paddle", "Triathlon", "Running"] as const;

// Per-session discipline, used when an athlete logs an extra session —
// distinct from the client's profile-level SPORTS (a goal, which can span
// several disciplines, e.g. Triathlon).
export const DISCIPLINES = [
  "Strength training",
  "Running",
  "Swimming",
  "Cycling",
  "Padel",
  "Football",
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

// Endurance disciplines get zone-based intensity labels and an optional
// distance field; everything else (strength/field sports) gets plain
// low/medium/high and no distance.
const ZONE_DISCIPLINES = new Set<string>(["Running", "Swimming", "Cycling"]);

// Distance is entered in this unit at the UI layer, then stored in meters.
// null means the discipline doesn't take a distance at all.
export function distanceUnitFor(discipline: string | null): "km" | "m" | null {
  if (discipline === "Swimming") return "m";
  if (discipline === "Running" || discipline === "Cycling") return "km";
  return null;
}

export function distanceToMeters(
  value: number,
  discipline: string | null,
): number {
  return distanceUnitFor(discipline) === "km" ? value * 1000 : value;
}

export function metersToDistance(
  meters: number,
  discipline: string | null,
): number {
  return distanceUnitFor(discipline) === "km" ? meters / 1000 : meters;
}

export function formatDistance(
  meters: number | null,
  discipline: string | null,
): string | null {
  const unit = distanceUnitFor(discipline);
  if (meters == null || !unit) return null;
  const value = metersToDistance(meters, discipline);
  return `${unit === "km" ? value.toFixed(1).replace(/\.0$/, "") : value} ${unit}`;
}

export const INTENSITY_LEVELS = ["low", "medium", "high"] as const;
export type IntensityLevel = (typeof INTENSITY_LEVELS)[number];

export function intensityLabel(
  level: IntensityLevel,
  discipline: string | null,
): string {
  if (!discipline || !ZONE_DISCIPLINES.has(discipline)) {
    return { low: "Low", medium: "Medium", high: "High" }[level];
  }
  return {
    low: "Low (Z1–Z2)",
    medium: "Medium (Z3–Z4)",
    high: "High (Z5+)",
  }[level];
}

export const MOVEMENT_PATTERNS = [
  "Squat",
  "Hinge",
  "Lunge",
  "Push (Horizontal)",
  "Push (Vertical)",
  "Pull (Horizontal)",
  "Pull (Vertical)",
  "Rotation",
  "Anti-Rotation",
  "Carry",
  "Gait",
  "Jump/Plyo",
  "Core/Stabilisation",
  "Mobility",
] as const;

export const CONTRACTION_TYPES = [
  "Concentric",
  "Eccentric",
  "Isometric",
  "Plyometric",
  "Isotonic",
] as const;

export const GOAL_TAGS = [
  "Strength",
  "Hypertrophy",
  "Power",
  "Speed",
  "Endurance",
  "Mobility",
  "Stability",
  "Plyometrics",
  "Agility",
  "Recovery",
  "Warm-up",
  "Cool-down",
] as const;

export const DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const BORG_LABELS: Record<number, string> = {
  1: "Very light",
  2: "Light",
  3: "Moderate",
  4: "Somewhat hard",
  5: "Hard",
  6: "Hard+",
  7: "Very hard",
  8: "Very hard+",
  9: "Extremely hard",
  10: "Maximum effort",
};

export function borgColor(v: number): string {
  if (v <= 3) return "bg-emerald-500 text-white";
  if (v <= 5) return "bg-yellow-400 text-yellow-950";
  if (v <= 8) return "bg-orange-500 text-white";
  return "bg-red-600 text-white";
}

export const SEED_EXERCISES: Array<{
  name: string;
  description: string;
  category_tags: string[];
  body_region: string | null;
}> = [
  // GYM (30)
  {
    name: "Squat",
    description: "Can be done at % of 1RM",
    category_tags: ["forza"],
    body_region: "lower",
  },
  {
    name: "Box Squat",
    description: "Slow eccentric, explosive concentric",
    category_tags: ["forza"],
    body_region: "lower",
  },
  {
    name: "Double-pulse Squat with Final Jump",
    description: "Load as % of 1RM (10-30%)",
    category_tags: ["potenza"],
    body_region: "lower",
  },
  {
    name: "Single-leg Eccentric Box Squat",
    description: "Optional added weight (10kg plate)",
    category_tags: ["potenza"],
    body_region: "lower",
  },
  {
    name: "Bench Press",
    description: "Can be done at % of 1RM",
    category_tags: ["forza"],
    body_region: "upper",
  },
  {
    name: "Dumbbell Chest Flies",
    description: "At % of 1RM",
    category_tags: ["forza"],
    body_region: "upper",
  },
  {
    name: "Pull-ups",
    description: "",
    category_tags: ["forza"],
    body_region: "upper",
  },
  {
    name: "Cable Row (Pulley)",
    description: "",
    category_tags: ["forza"],
    body_region: "upper",
  },
  {
    name: "Isometric-hold Cable Pull-down",
    description: "Hold at bottom",
    category_tags: ["potenza", "forza"],
    body_region: "upper",
  },
  {
    name: "Cable Front Pull",
    description: "",
    category_tags: ["forza"],
    body_region: "upper",
  },
  {
    name: "Alternating Bent-over Row from Push-up Position",
    description: "With kettlebell or dumbbell",
    category_tags: ["forza"],
    body_region: "upper",
  },
  {
    name: "Seated Military Press",
    description: "",
    category_tags: ["forza"],
    body_region: "upper",
  },
  {
    name: "Triceps Extensions",
    description: "At % of 1RM",
    category_tags: ["forza"],
    body_region: "upper",
  },
  {
    name: "Cable Triceps Extensions",
    description: "",
    category_tags: ["forza"],
    body_region: "upper",
  },
  {
    name: "Weighted Dips",
    description: "",
    category_tags: ["forza"],
    body_region: "upper",
  },
  {
    name: "Bulgarian Split Squat",
    description: "With dumbbell, per leg",
    category_tags: ["forza"],
    body_region: "lower",
  },
  {
    name: "Leg Press",
    description: "At % of 1RM",
    category_tags: ["forza"],
    body_region: "lower",
  },
  {
    name: "Leg Extension (Isometric Hold)",
    description: "10s per leg alternating for 1 min",
    category_tags: ["forza"],
    body_region: "lower",
  },
  {
    name: "Bilateral Deadlift",
    description: "Concentric only, at % of 1RM",
    category_tags: ["forza"],
    body_region: "lower",
  },
  {
    name: "Step-up with Jump",
    description: "Per leg",
    category_tags: ["potenza"],
    body_region: "lower",
  },
  {
    name: "Lateral Slide",
    description: "Adductor work with kettlebell",
    category_tags: ["forza"],
    body_region: "lower",
  },
  {
    name: "Copenhagen Plank",
    description: "Adductor/core stability",
    category_tags: ["forza"],
    body_region: "lower",
  },
  {
    name: "Wall Sit",
    description: "Isometric hold",
    category_tags: ["forza"],
    body_region: "lower",
  },
  {
    name: "Isometric Push-up with Jump",
    description: "Optional added weight",
    category_tags: ["potenza"],
    body_region: "upper",
  },
  {
    name: "Kneeling Cable Rotation",
    description: "Per side, tempo control",
    category_tags: ["potenza"],
    body_region: "full",
  },
  {
    name: "Medicine Ball Chest Throw",
    description: 'Timed sets (20-25")',
    category_tags: ["potenza"],
    body_region: "upper",
  },
  {
    name: "Medicine Ball Slam",
    description: "Timed sets",
    category_tags: ["potenza"],
    body_region: "full",
  },
  {
    name: "Isometric Abs Hold",
    description: "Core finisher",
    category_tags: ["forza"],
    body_region: "full",
  },
  {
    name: "Isometric Abs + Medicine Ball Rotations",
    description: "Core finisher",
    category_tags: ["forza"],
    body_region: "full",
  },
  {
    name: "Mobility Warm-up + Stationary Bike Activation",
    description: "6-10 min",
    category_tags: ["forza", "potenza"],
    body_region: "full",
  },
  // PLYO (5)
  {
    name: "Bilateral Forward Jump",
    description: "",
    category_tags: ["potenza"],
    body_region: "lower",
  },
  {
    name: "Single-leg Forward Jump",
    description: "Per leg",
    category_tags: ["potenza"],
    body_region: "lower",
  },
  {
    name: "Lateral Jump",
    description: "",
    category_tags: ["potenza"],
    body_region: "lower",
  },
  {
    name: "Single-leg Box Jump",
    description: "Box height ~35cm",
    category_tags: ["potenza"],
    body_region: "lower",
  },
  {
    name: "Single-leg Lateral Jump + Vertical Jump",
    description: "Per leg",
    category_tags: ["potenza"],
    body_region: "lower",
  },
  // RUNNING / FIELD (11)
  {
    name: "Continuous Run at Variable Pace",
    description: "At 60-70% max speed",
    category_tags: ["aerobica"],
    body_region: "full",
  },
  {
    name: "Pace Variations (Stride + Slow Jog)",
    description: "Fartlek-style intervals",
    category_tags: ["aerobica"],
    body_region: "full",
  },
  {
    name: "Pyramid Run (100-300-600m)",
    description: "Ascending/descending distances",
    category_tags: ["aerobica"],
    body_region: "full",
  },
  {
    name: "Long Pyramid Run (200-100-50m)",
    description: "Includes sprint component",
    category_tags: ["aerobica", "anaerobica"],
    body_region: "full",
  },
  {
    name: "Pyramid Run (100-200-400-600m)",
    description: "Recovery 1:1 with run time",
    category_tags: ["aerobica"],
    body_region: "full",
  },
  {
    name: "Maximal Sprint RSA",
    description: "7s all-out, 23s recovery",
    category_tags: ["rsa"],
    body_region: "full",
  },
  {
    name: "Shuttle Runs with Sprints",
    description: "20/40/60m pattern",
    category_tags: ["rsa", "anaerobica"],
    body_region: "full",
  },
  {
    name: "Warm-up with Running Drills",
    description: "Dynamic prep",
    category_tags: ["aerobica"],
    body_region: "full",
  },
  {
    name: "Dynamic Stretching",
    description: "Pre-workout",
    category_tags: ["aerobica"],
    body_region: "full",
  },
  {
    name: "Static Stretching",
    description: "Post-workout cooldown",
    category_tags: ["aerobica"],
    body_region: "full",
  },
  {
    name: "Complementary Double Aerobic (Zone 2 Run)",
    description: "Walk/run intervals in Zone 2",
    category_tags: ["aerobica"],
    body_region: "full",
  },
  // SWIMMING (4)
  {
    name: "Freestyle Swimming",
    description: "Max 200m warm-up",
    category_tags: ["aerobica"],
    body_region: "full",
  },
  {
    name: "Swimming Pyramid Set (100-200-300-400m)",
    description: "Target 2km, recovery 1:1",
    category_tags: ["aerobica"],
    body_region: "full",
  },
  {
    name: "Postural Cooldown",
    description: "Post-swim recovery",
    category_tags: ["aerobica"],
    body_region: "full",
  },
  {
    name: "Zone 1 Cyclic Cooldown",
    description: "Very low intensity",
    category_tags: ["aerobica"],
    body_region: "full",
  },
  // WARM-UP / ACTIVATION (4)
  {
    name: "Mobility Warm-up + 10min Row",
    description: "",
    category_tags: ["forza"],
    body_region: "full",
  },
  {
    name: "Activation with Mobility and Running Drills",
    description: "",
    category_tags: ["aerobica"],
    body_region: "full",
  },
  {
    name: "3-minute Core Circuit (30s on/30s off)",
    description: "Pre-workout activation",
    category_tags: ["forza"],
    body_region: "full",
  },
  {
    name: "Injury Prevention Sprints (5/10/15m)",
    description: "Short acceleration prep",
    category_tags: ["rsa"],
    body_region: "full",
  },
];
