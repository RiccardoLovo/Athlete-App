import { BORG_LABELS, borgColor } from "@/lib/coachdesk/constants";

/**
 * How hard a session should feel, and how hard it did.
 *
 * The athlete has always reported an effort after every session. The coach
 * had no way to say what they were aiming for, which made the most useful
 * number in the app unreadable: a reported 8 is good news on a threshold
 * session and a reason to call the athlete on a recovery run, and nothing
 * here knew which it was looking at.
 *
 * One scale, one vocabulary, both directions — so "7" means the same thing
 * to the person writing it and the person living it.
 */

/** A target on its own: what the coach asked for. */
export function EffortChip({
  value,
  label = "Target",
}: {
  value: number;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-baseline gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${borgColor(value)}`}
      title={`${label}: ${value}/10 — ${BORG_LABELS[value]}`}
    >
      {label} {value}
      <span className="font-sans normal-case opacity-80">
        {BORG_LABELS[value]}
      </span>
    </span>
  );
}

/**
 * The coach's input. Ten buttons rather than a slider: a slider makes the
 * coach drag to a number they already have in mind, and the existing one
 * on the athlete's own screen is the control the design notes flagged for
 * replacement. "Not set" is a real option, not the absence of a choice.
 */
export function TargetEffortPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        Should feel
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              title={`${n}/10 — ${BORG_LABELS[n]}`}
              aria-pressed={on}
              // Tapping the chosen number again clears it, so a coach can
              // take back a target rather than being stuck with the
              // nearest wrong one.
              onClick={() => onChange(on ? null : n)}
              className={`h-7 w-7 rounded-md border font-mono text-[11px] tabular-nums ${
                on ? borgColor(n) : "border-border hover:bg-muted"
              }`}
            >
              {n}
            </button>
          );
        })}
        <span className="ml-1 min-w-[6.5rem] text-[11px] text-muted-foreground">
          {value ? BORG_LABELS[value] : "Not set"}
        </span>
      </div>
    </div>
  );
}

/**
 * How far off the target the session landed. Two apart is the threshold
 * for saying anything: RPE is self-reported on a ten-point scale, so one
 * step is inside the noise and flagging it would train the coach to
 * ignore the flag.
 */
export function effortGap(
  target: number | null | undefined,
  reported: number | null | undefined,
): { delta: number; notable: boolean } | null {
  if (target == null || reported == null) return null;
  const delta = reported - target;
  return { delta, notable: Math.abs(delta) >= 2 };
}

/** "Felt 8 · 2 harder than asked" — the comparison, for the coach. */
export function EffortCompare({
  target,
  reported,
}: {
  target: number | null | undefined;
  reported: number | null | undefined;
}) {
  const gap = effortGap(target, reported);
  if (reported == null) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex shrink-0 items-baseline gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${borgColor(reported)}`}
        title={`Reported ${reported}/10 — ${BORG_LABELS[reported]}`}
      >
        Felt {reported}
        <span className="font-sans normal-case opacity-80">
          {BORG_LABELS[reported]}
        </span>
      </span>
      {gap?.notable && (
        <span className="font-mono text-[10px] uppercase tracking-wide text-warning">
          {gap.delta > 0 ? `+${gap.delta} harder` : `${gap.delta} easier`} than
          asked
        </span>
      )}
      {/* A target the coach never set is said plainly rather than filled
          in with the middle of the scale, which would invent an
          instruction nobody gave. */}
      {target == null && (
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          no target set
        </span>
      )}
    </span>
  );
}
