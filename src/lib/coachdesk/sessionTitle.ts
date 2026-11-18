import { DISCIPLINE_ICON, type Discipline } from "./prescription";

// Sessions carry no name in the database — every `sessions.name` is null —
// and a session is a bag of exercises that often spans disciplines
// (Mobility + Strength together, sometimes Cycling + Running). So a card
// has to be told what to call itself, from what is actually in it.

/** What each discipline is called on a card: short, the way a coach says it. */
const SHORT: Record<string, string> = {
  Running: "Run",
  Swimming: "Swim",
  Cycling: "Bike",
  Strength: "Strength",
  Mobility: "Mobility",
  Football: "Football",
  Padel: "Padel",
};

export type TitledExercise = {
  exercises?: { discipline?: string | null; name_en?: string | null } | null;
};

/**
 * Disciplines present, most-used first. Ties keep the order the coach put
 * them in, so a session that opens with mobility and continues with
 * strength is still "Strength & Mobility" when strength dominates.
 */
function rank(exs: TitledExercise[]): { discipline: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of exs) {
    const d = e.exercises?.discipline;
    if (!d) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([discipline, count]) => ({ discipline, count }))
    .sort((a, b) => b.count - a.count);
}

/** The discipline a card takes its icon from. */
export function primaryDiscipline(exs: TitledExercise[]): string | null {
  return rank(exs)[0]?.discipline ?? null;
}

export function disciplineIcon(discipline: string | null): string {
  if (!discipline) return "📋";
  return DISCIPLINE_ICON[discipline as Discipline] ?? "📋";
}

/**
 * A name for a session that has none. One discipline gives its own name;
 * two are joined; more than two name the dominant one and count the rest,
 * because "Strength & Mobility & Running & Cycling" tells you nothing.
 */
export function sessionTitle(
  name: string | null | undefined,
  exs: TitledExercise[],
): string {
  if (name && name.trim()) return name.trim();

  const ranked = rank(exs);
  if (!ranked.length) return "Session";

  const named = ranked.map((r) => SHORT[r.discipline] ?? r.discipline);
  if (named.length === 1) return named[0];
  if (named.length === 2) return `${named[0]} & ${named[1]}`;
  return `${named[0]} +${named.length - 1} more`;
}

/** "7 exercises" — the line under the title. */
export function sessionSubtitle(exs: TitledExercise[]): string {
  return `${exs.length} ${exs.length === 1 ? "exercise" : "exercises"}`;
}
