import { lateLabel, type SessionState } from "@/lib/coachdesk/adherence";

/**
 * What happened to a prescribed session, in one word, for the coach.
 *
 * The athlete's own card says the same thing with a check mark and a
 * pill, because on a phone it is the only session on screen. This is for
 * a desktop grid of twenty-one of them, where a word in the right colour
 * is faster to scan than an icon. Both read the same SessionState, so the
 * coach and the athlete can disagree about the training but never about
 * whether it happened.
 */
export function SessionStateBadge({ state }: { state: SessionState }) {
  const base =
    "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide";

  switch (state.kind) {
    case "done": {
      const late = lateLabel(state.lateDays);
      return (
        <span
          className={`${base} bg-success/15 text-success`}
          title={late ? `Done ${late}` : "Done on the day"}
        >
          {/* The delay is the useful part for a coach: a session moved by
              a day is a schedule to work around, not a gap in training. */}
          {late ? `Done · ${late}` : "Done"}
        </span>
      );
    }
    case "in-progress":
      return (
        <span
          className={`${base} bg-muted text-muted-foreground`}
          title="The athlete has started logging this and not finished"
        >
          Open
        </span>
      );
    case "missed":
      return (
        <span
          className={`${base} bg-warning/15 text-warning`}
          title="The day passed without this being finished"
        >
          Missed
        </span>
      );
    case "passed-optional":
      return (
        <span
          className={`${base} bg-muted text-muted-foreground`}
          title="Optional, and its day has passed — not owed"
        >
          Skipped
        </span>
      );
    // Today and anything still ahead carry no badge. A week of "Upcoming"
    // labels is noise, and the absence already says it.
    default:
      return null;
  }
}
