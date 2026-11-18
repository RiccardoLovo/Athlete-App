import {
  primaryDiscipline,
  disciplineIcon,
} from "@/lib/coachdesk/sessionTitle";

/**
 * How much of the week is actually behind you, per discipline.
 *
 * The week feed answers "what am I doing on Thursday". It cannot answer
 * "am I on track", because that question is about the week as a whole and
 * the feed only ever shows one day at a time. These rings answer it in the
 * terms a triathlete already thinks in: I owe three swims, I have done one.
 *
 * Counted sessions, not estimated hours. A session either happened or it
 * did not, so the number is exact — where hours for a strength session
 * cannot be derived at all, and hours for an endurance session are an
 * estimate that moves whenever a threshold is edited. Once Garmin and
 * Strava are wired in there will be real elapsed time to fill these with;
 * until then a ring built on estimates would read as measurement.
 */

export type RingSession = {
  id: string;
  is_optional?: boolean | null;
  exs: { exercises?: { discipline?: string | null } | null }[];
};

/**
 * A session the athlete logged themselves. It carries its discipline on
 * the row rather than through exercises, and it was never prescribed, so
 * it cannot be part of any planned total.
 */
export type ExtraSession = { id: string; discipline?: string | null };

export type DisciplineProgress = {
  discipline: string;
  /** Required sessions planned for the week. */
  planned: number;
  /** Required sessions finished. */
  done: number;
  /** Started and saved, but never finished. Shown, never counted as done. */
  inProgress: number;
  optionalPlanned: number;
  optionalDone: number;
  /** Sessions the athlete added themselves — never planned, so never owed. */
  extra: number;
};

/**
 * A session counts once, under its primary discipline — the same rule that
 * picks the icon on its card, so the ring and the card never disagree.
 * A swim that ends with ten minutes of core is a swim.
 *
 * Optional sessions are kept out of the denominator. A 3-of-4 ring where
 * the fourth was never required reads as a missed session, which is the
 * opposite of what "optional" means; they get their own line instead.
 */
export function weekProgress(
  sessions: RingSession[],
  finished: Set<string>,
  drafts: Set<string>,
  extras: ExtraSession[] = [],
): DisciplineProgress[] {
  const by = new Map<string, DisciplineProgress>();
  const blank = (discipline: string): DisciplineProgress => ({
    discipline,
    planned: 0,
    done: 0,
    inProgress: 0,
    optionalPlanned: 0,
    optionalDone: 0,
    extra: 0,
  });

  for (const s of sessions) {
    const d = primaryDiscipline(s.exs);
    if (!d) continue;
    const row = by.get(d) ?? blank(d);
    const isDone = finished.has(s.id);
    if (s.is_optional) {
      row.optionalPlanned += 1;
      if (isDone) row.optionalDone += 1;
    } else {
      row.planned += 1;
      if (isDone) row.done += 1;
      else if (drafts.has(s.id)) row.inProgress += 1;
    }
    by.set(d, row);
  }

  // An extra session opens a ring for a discipline the week never planned
  // — a swim in a week with no swim prescribed is still a swim done.
  for (const e of extras) {
    const d = e.discipline;
    if (!d) continue;
    const row = by.get(d) ?? blank(d);
    row.extra += 1;
    by.set(d, row);
  }

  // Most sessions first, so the backbone of the week leads.
  const weight = (r: DisciplineProgress) =>
    r.planned + r.optionalPlanned + r.extra;
  return [...by.values()].sort(
    (a, b) => weight(b) - weight(a) || a.discipline.localeCompare(b.discipline),
  );
}

const R = 20;
const C = 2 * Math.PI * R;

function Ring({ row }: { row: DisciplineProgress }) {
  const { planned, done, inProgress } = row;
  // An all-optional discipline has no required denominator; its ring shows
  // the optional work instead of dividing by zero.
  const total = planned || row.optionalPlanned;
  const filled = planned ? done : row.optionalDone;
  const fraction = total > 0 ? Math.min(filled / total, 1) : 0;
  const complete = total > 0 && filled >= total;
  // Nothing was asked for in this discipline — the ring exists only
  // because the athlete went and did some anyway. There is no fraction to
  // draw, so the count stands alone rather than reading "0/0".
  const unplanned = total === 0;

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1">
      <div className="relative h-12 w-12">
        <svg viewBox="0 0 48 48" className="h-12 w-12 -rotate-90">
          <circle
            cx="24"
            cy="24"
            r={R}
            fill="none"
            strokeWidth="4"
            // Dashed when nothing was prescribed: an unbroken track reads
            // as a target that is going unmet.
            strokeDasharray={unplanned ? "3 5" : undefined}
            className="stroke-border"
          />
          {fraction > 0 && (
            <circle
              cx="24"
              cy="24"
              r={R}
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${C * fraction} ${C}`}
              // Green only when the week's work for this discipline is
              // actually finished: the one place the colour carries
              // information rather than decorating the ring.
              className={complete ? "stroke-success" : "stroke-foreground"}
            />
          )}
        </svg>
        <span
          aria-hidden
          className="absolute inset-0 grid place-items-center text-base leading-none"
        >
          {disciplineIcon(row.discipline)}
        </span>
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {unplanned ? (
          <span className="text-foreground">+{row.extra}</span>
        ) : (
          <>
            <span className={complete ? "text-success" : "text-foreground"}>
              {filled}
            </span>
            /{total}
            {row.extra > 0 && (
              <span className="text-foreground">{` +${row.extra}`}</span>
            )}
          </>
        )}
      </span>
      {inProgress > 0 && (
        <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
          {inProgress} open
        </span>
      )}
    </div>
  );
}

export function WeekRings({
  sessions,
  finished,
  drafts,
  extras = [],
}: {
  sessions: RingSession[];
  finished: Set<string>;
  drafts: Set<string>;
  extras?: ExtraSession[];
}) {
  // Computed on every render on purpose: the caller rebuilds `sessions`
  // each time, so a useMemo keyed on it would never hit. A week is at most
  // fourteen sessions, so there is nothing to save.
  const rows = weekProgress(sessions, finished, drafts, extras);

  if (!rows.length) return null;

  const planned = rows.reduce((n, r) => n + r.planned, 0);
  const done = rows.reduce((n, r) => n + r.done, 0);
  const optPlanned = rows.reduce((n, r) => n + r.optionalPlanned, 0);
  const optDone = rows.reduce((n, r) => n + r.optionalDone, 0);
  const extraTotal = rows.reduce((n, r) => n + r.extra, 0);

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          This week
        </h2>
        <span className="text-xs text-muted-foreground">
          {planned === 0 ? (
            <>nothing prescribed this week</>
          ) : (
            <>
              <span className="font-medium text-foreground tabular-nums">
                {done}
              </span>{" "}
              of {planned} {planned === 1 ? "session" : "sessions"} done
            </>
          )}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {rows.map((r) => (
          <Ring key={r.discipline} row={r} />
        ))}
      </div>
      {(optPlanned > 0 || extraTotal > 0) && (
        <p className="text-[11px] text-muted-foreground">
          {optPlanned > 0 && (
            <>
              Plus {optPlanned} optional{" "}
              {optPlanned === 1 ? "session" : "sessions"}
              {optDone > 0 && `, ${optDone} done`}.{" "}
            </>
          )}
          {extraTotal > 0 && (
            <>
              {extraTotal} {extraTotal === 1 ? "session" : "sessions"} you added
              yourself, shown as +{extraTotal} and kept out of the planned
              totals.
            </>
          )}
        </p>
      )}
    </div>
  );
}
