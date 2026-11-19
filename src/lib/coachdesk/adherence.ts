/**
 * What state a prescribed session is in, as one rule.
 *
 * Three surfaces need to agree about this — the card in the week feed, the
 * rings above it, and the coach's view of the same week — and each of them
 * had been inferring it separately from whatever columns were at hand. The
 * feed's old answer was "a workout_log row exists", which is true from the
 * first autosave and so counted a session with one number typed into it as
 * finished.
 *
 * Nothing here is stored. A missed session is not a row that gets written
 * when a week closes: it is a planned date that went past without a
 * finished log, which is a fact about the calendar and needs no cron job,
 * no backfill, and no second source of truth to drift from the first.
 */

export type SessionState =
  /** Finished. `lateDays` > 0 when it happened after the day it was set. */
  | { kind: "done"; lateDays: number }
  /** Opened and autosaved, never finished. */
  | { kind: "in-progress" }
  /** The day has passed and it was never finished. */
  | { kind: "missed" }
  /** Optional, and its day has passed. Not owed, so not missed. */
  | { kind: "passed-optional" }
  /** Planned before the athlete's adherence_from line. Not judged. */
  | { kind: "before-tracking" }
  | { kind: "today" }
  | { kind: "upcoming" };

export type AdherenceInput = {
  /** Session ids with a log that is no longer a draft. */
  finished: Set<string>;
  /** Session ids with a draft log. */
  drafts: Set<string>;
  /** Session id -> the date the athlete says it happened (ISO yyyy-mm-dd). */
  performedAt: Map<string, string>;
  /** Today, as an ISO date in the viewer's own timezone. */
  todayISO: string;
  /**
   * A line under the past: nothing planned before this date is ever
   * counted as missed (clients.adherence_from).
   *
   * Needed because adherence is derived from the calendar. That is what
   * makes it trustworthy, and it also means restructuring a plan
   * retroactively re-judges months that were never going to be trained —
   * an athlete coming back from injury does not need the app to open on
   * forty missed sessions.
   *
   * It changes counting only. The sessions stay, the logs stay, and every
   * weight and threshold recorded against them still counts.
   */
  adherenceFrom?: string | null;
};

export type AdherenceSession = {
  id: string;
  /** The calendar date this session was prescribed for (ISO yyyy-mm-dd). */
  planned_date: string;
  is_optional?: boolean | null;
};

/** Whole days from `a` to `b`, both ISO dates. Negative when b precedes a. */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`);
  return Math.round(ms / 86_400_000);
}

/**
 * Was this session owed and never finished? A fact about the calendar,
 * separate from what the card calls it.
 *
 * The distinction matters for a session the athlete opened on the day,
 * typed something into, and never finished. The card calls that
 * "In progress", because tapping it resumes where they left off — but by
 * Sunday night it is work that did not happen, and a ring that files it
 * under "still to come" is lying about the week. Both readings are true;
 * they answer different questions, so they are different functions.
 */
export function isMissed(
  s: AdherenceSession,
  {
    finished,
    todayISO,
    adherenceFrom,
  }: Pick<AdherenceInput, "finished" | "todayISO" | "adherenceFrom">,
): boolean {
  if (finished.has(s.id)) return false;
  if (s.is_optional) return false;
  if (adherenceFrom && s.planned_date < adherenceFrom) return false;
  return daysBetween(todayISO, s.planned_date) < 0;
}

export function sessionState(
  s: AdherenceSession,
  { finished, drafts, performedAt, todayISO, adherenceFrom }: AdherenceInput,
): SessionState {
  if (finished.has(s.id)) {
    const on = performedAt.get(s.id);
    // Late, never early: a session done ahead of its day is just done. The
    // plan says which day, not which hour, and bringing one forward is a
    // normal thing to do with a life.
    const lateDays = on ? Math.max(daysBetween(s.planned_date, on), 0) : 0;
    return { kind: "done", lateDays };
  }
  // A draft is resumable whether or not its day has passed, so that is
  // what the card says. `isMissed` is what the rings count.
  if (drafts.has(s.id)) return { kind: "in-progress" };

  // Before the line, an unfinished session is simply past, not missed.
  // Shown as nothing rather than as a verdict.
  if (adherenceFrom && s.planned_date < adherenceFrom)
    return { kind: "before-tracking" };

  const offset = daysBetween(todayISO, s.planned_date);
  if (offset > 0) return { kind: "upcoming" };
  // Today is not yet missed — there are still hours in it.
  if (offset === 0) return { kind: "today" };
  return s.is_optional ? { kind: "passed-optional" } : { kind: "missed" };
}

/** How a done-late session is described on a card. */
export function lateLabel(lateDays: number): string | null {
  if (lateDays <= 0) return null;
  if (lateDays === 1) return "a day late";
  if (lateDays < 7) return `${lateDays} days late`;
  const weeks = Math.round(lateDays / 7);
  return weeks === 1 ? "a week late" : `${weeks} weeks late`;
}
