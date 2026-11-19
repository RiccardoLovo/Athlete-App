/**
 * What to bring, for one session.
 *
 * The data exists and has never been shown to the athlete. Strength
 * equipment lives in exercise_annotations.equipment (written by the
 * exercise-bank importer, used so far only to rank swap candidates) and
 * swim gear in session_exercises.prescription.equipment. Both are per
 * exercise, so answering "what do I need at the pool" meant opening six
 * rows one at a time — which is exactly what nobody does on the way out
 * of the house.
 *
 * The vocabulary is human-written and stays that way on screen: "dumbbell
 * or kettlebell" is a more useful instruction than anything a tidier
 * taxonomy would replace it with. Only the duplicates are collapsed.
 */

/** The raw strings as they appear in the bank, for one exercise. */
export type EquipmentSource = {
  /** exercise_annotations.equipment — strength and annotated work. */
  annotated?: string[] | null;
  /** prescription.equipment — one string, swim gear. */
  prescribed?: unknown;
};

/**
 * The only fields of a session_exercises row that equipment needs. Named
 * so the callers can stop widening the whole row to `any` just to reach
 * two columns.
 */
export type EquipmentRow = {
  session_id?: string | null;
  exercise_id?: string | null;
  prescription?: unknown;
};

export type EquipmentNeed = {
  /** What to show, in the coach's own words. */
  label: string;
  /** How many exercises in the session need it. */
  count: number;
};

/**
 * The key two spellings have to share to count as one thing.
 *
 * The bank really contains both "dumbbell" and "dumbbells", and both
 * "plates" and "plate" — the same barbell session lists several of each,
 * and without this a six-exercise session shows ten chips for four items.
 * Only the trailing plural is normalised: "bench" and "bench or box" are
 * genuinely different requirements and stay apart.
 */
function key(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  // Singularise each alternative in "dumbbells or kettlebells" so it
  // matches "dumbbell or kettlebell".
  return s
    .split(/\s+or\s+/)
    .map((part) => part.replace(/(?<=[a-z]{3})s$/, ""))
    .join(" or ");
}

/** "None" is the form's way of saying nothing, not a thing to carry. */
function isNothing(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  return s === "" || s === "none" || s === "no equipment" || s === "n/a";
}

export function sessionEquipment(sources: EquipmentSource[]): EquipmentNeed[] {
  const byKey = new Map<string, EquipmentNeed>();

  for (const src of sources) {
    // Per exercise, so an exercise listing "dumbbell" twice still counts
    // once towards how many exercises need one.
    const seen = new Set<string>();
    const raws = [
      ...(src.annotated ?? []),
      ...(typeof src.prescribed === "string" ? [src.prescribed] : []),
    ];
    for (const raw of raws) {
      if (typeof raw !== "string" || isNothing(raw)) continue;
      const k = key(raw);
      if (seen.has(k)) continue;
      seen.add(k);
      const existing = byKey.get(k);
      if (existing) {
        existing.count += 1;
        // Keep the shorter spelling: between "dumbbell" and "dumbbells"
        // the singular reads better on a chip, and between two equal
        // lengths the first one wins so the result is stable.
        const label = raw.trim().replace(/\s+/g, " ");
        if (label.length < existing.label.length) existing.label = label;
      } else {
        byKey.set(k, { label: raw.trim().replace(/\s+/g, " "), count: 1 });
      }
    }
  }

  // Most-needed first, then alphabetical, so the barbell you cannot train
  // without leads and the order never shifts between renders.
  return [...byKey.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

/** One line for a tight space: "barbell, plates, rack +2 more". */
export function equipmentLine(needs: EquipmentNeed[], max = 3): string | null {
  if (!needs.length) return null;
  const shown = needs.slice(0, max).map((n) => n.label);
  const rest = needs.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} +${rest} more` : shown.join(", ");
}
