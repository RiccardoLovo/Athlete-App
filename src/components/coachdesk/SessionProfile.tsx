import { useMemo } from "react";
import {
  buildProfile,
  profileTicks,
  segmentWeight,
  zoneHeight,
  type Profile,
  type ProfileSegment,
} from "@/lib/coachdesk/profile";
import type { BlockLike, RoundLike } from "@/lib/coachdesk/blocks";
import { cn } from "@/lib/utils";
import { useLatestThreshold } from "./IntervalBuilder";

/**
 * A ride is prescribed in watts, so neither its duration nor its distance
 * can be worked out without the athlete's typical speed. Everything else
 * gets what it needs from the pace the coach set.
 */
function useProfileContext(
  clientId: string | null | undefined,
  discipline: string | null | undefined,
) {
  const { data: bikeSpeedKmh } = useLatestThreshold(
    discipline === "Cycling" ? clientId : null,
    "bike_speed_kmh",
  );
  // Where the coach set a zone but no pace, the athlete's own threshold
  // supplies it, so a session is measurable as soon as the thresholds
  // are on file rather than only once someone types a number.
  const { data: runThresholdSecPerKm } = useLatestThreshold(
    discipline === "Cycling" || discipline === "Swimming" ? null : clientId,
    "run_threshold_pace_sec_per_km",
  );
  const { data: cssSecPer100m } = useLatestThreshold(
    discipline === "Swimming" ? clientId : null,
    "css_pace_sec_per_100m",
  );
  return { bikeSpeedKmh, runThresholdSecPerKm, cssSecPer100m };
}

import { zoneBg } from "@/lib/coachdesk/zoneColors";

/**
 * The shape of a session at a glance. The same component serves the coach
 * while they build (passing what is on screen) and the athlete afterwards
 * (passing what is saved), so the two can never disagree.
 *
 * It draws against whichever axis the data supports: minutes where every
 * block resolves to a duration, kilometres where they are all distances,
 * and nothing at all where there is nothing to measure.
 */
export function SessionProfile({
  blocks,
  rounds,
  discipline,
  clientId,
  className,
}: {
  blocks: (BlockLike & { id: string })[];
  rounds: (RoundLike & { workout_block_id?: string | null })[];
  discipline: string | null | undefined;
  /** Needed only for cycling, whose numbers come from the athlete's speed. */
  clientId?: string | null;
  className?: string;
}) {
  const { bikeSpeedKmh, runThresholdSecPerKm, cssSecPer100m } =
    useProfileContext(clientId, discipline);
  const profile = useMemo(
    () =>
      buildProfile(blocks, rounds, discipline, {
        bikeSpeedKmh,
        runThresholdSecPerKm,
        cssSecPer100m,
      }),
    [
      blocks,
      rounds,
      discipline,
      bikeSpeedKmh,
      runThresholdSecPerKm,
      cssSecPer100m,
    ],
  );

  if (!profile.segments.length) return null;

  return (
    <div className={cn(className)}>
      <div className="flex h-20 items-end gap-[3px]">
        {profile.segments.map((s) => (
          <Bar key={s.key} seg={s} profile={profile} />
        ))}
      </div>
      <Axis profile={profile} />
    </div>
  );
}

/**
 * What the session adds up to. Reads from the same profile the chart draws,
 * so the numbers and the picture can never disagree — and unlike a plain
 * sum it accounts for rests and for distances turned into time by a pace.
 *
 * Renders whether or not the chart can, because a total is still worth
 * having when the shape is not drawable. Where some blocks carry nothing
 * to count, it says so rather than presenting a part as the whole.
 */
export function SessionTotals({
  blocks,
  rounds,
  discipline,
  clientId,
  className,
}: {
  blocks: (BlockLike & { id: string })[];
  rounds: (RoundLike & { workout_block_id?: string | null })[];
  discipline: string | null | undefined;
  /** Needed only for cycling, whose numbers come from the athlete's speed. */
  clientId?: string | null;
  className?: string;
}) {
  const { bikeSpeedKmh, runThresholdSecPerKm, cssSecPer100m } =
    useProfileContext(clientId, discipline);
  const profile = useMemo(
    () =>
      buildProfile(blocks, rounds, discipline, {
        bikeSpeedKmh,
        runThresholdSecPerKm,
        cssSecPer100m,
      }),
    [
      blocks,
      rounds,
      discipline,
      bikeSpeedKmh,
      runThresholdSecPerKm,
      cssSecPer100m,
    ],
  );
  if (!blocks.length) return null;

  const work = profile.segments.filter((s) => s.kind === "work");
  const timed = work.filter((s) => s.durationMin != null);
  const measured = work.filter((s) => s.distanceKm != null);
  const minutes = profile.segments.reduce(
    (a, s) => a + (s.durationMin ?? 0),
    0,
  );
  const km = work.reduce((a, s) => a + (s.distanceKm ?? 0), 0);

  // Computed numbers are labelled EST. and carry an asterisk, and the
  // footnote says what they lean on. A worked-out figure shown the same
  // way as a prescribed one is the difference between a plan and a guess,
  // and the athlete cannot tell them apart otherwise.
  const items: { label: string; value: string; unit?: string }[] = [];
  if (timed.length)
    items.push({
      label: profile.minEstimated ? "Est. time*" : "Time",
      value: String(Math.round(minutes)),
      unit: "MIN",
    });
  if (measured.length)
    items.push({
      label: profile.kmEstimated ? "Est. distance*" : "Distance",
      value: String(Math.round(km * 100) / 100),
      unit: "KM",
    });
  if (profile.hardestZone != null)
    items.push({ label: "Hardest zone", value: `Z${profile.hardestZone}` });
  items.push({ label: "Blocks", value: String(blocks.length) });

  const uncounted = work.length - Math.max(timed.length, measured.length);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {items.map((it) => (
          <div key={it.label}>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
              {it.label}
            </div>
            <div className="text-xl font-medium tabular-nums">
              {it.value}
              {it.unit && (
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                  {it.unit}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {profile.estimatedFrom.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          *Worked out from{" "}
          {profile.estimatedFrom
            .map((p) =>
              p === "pace"
                ? "the prescribed pace"
                : p === "zone"
                  ? "the zone and your threshold"
                  : "a typical ride speed",
            )
            .join(" and ")}
          .
        </p>
      )}
      {uncounted > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {uncounted} {uncounted === 1 ? "block is" : "blocks are"} not counted
          — no target set.
        </p>
      )}
    </div>
  );
}

function Axis({ profile }: { profile: Profile }) {
  const unit = profile.axis === "km" ? "km" : "'";
  const ticks = profileTicks(profile.total, profile.axis);

  // No axis means something in the session has no target, so no bar can
  // be placed on a scale. The shape is still worth drawing — six
  // intervals look like six intervals — but it is labelled as shape
  // rather than quietly implying a length nobody set.
  if (!profile.axis || ticks.length < 2)
    return (
      <p className="mt-1 text-[10px] text-muted-foreground">
        Shape only — widths are not to scale until every block has a target.
      </p>
    );

  return (
    <div className="relative mt-1.5 h-3.5">
      {ticks.map((t, i) => (
        <span
          key={t}
          className="absolute top-0 font-mono text-[10px] text-muted-foreground"
          style={{
            left: `${(t / profile.total) * 100}%`,
            transform:
              i === 0
                ? "none"
                : i === ticks.length - 1
                  ? "translateX(-100%)"
                  : "translateX(-50%)",
          }}
        >
          {t}
          {unit}
        </span>
      ))}
    </div>
  );
}

function Bar({ seg, profile }: { seg: ProfileSegment; profile: Profile }) {
  const measured =
    profile.axis === "min"
      ? seg.durationMin != null
      : seg.kind === "rest" || seg.distanceKm != null;

  const title = [
    seg.label,
    profile.axis === "min" && seg.durationMin != null
      ? `${Math.round(seg.durationMin)} min`
      : profile.axis === "km" && seg.distanceKm != null
        ? `${seg.distanceKm} km`
        : null,
    seg.zone != null ? `Z${seg.zone}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const tone = zoneBg(seg.zone, "bg-muted-foreground");

  return (
    <div
      title={title}
      style={{
        flexGrow: segmentWeight(seg, profile.axis),
        flexBasis: 0,
        height: `${zoneHeight(seg.zone, seg.kind) * 100}%`,
      }}
      className={cn(
        "min-w-[4px] rounded-[3px]",
        measured ? tone : "border border-dashed border-muted-foreground",
        // Rest is the same cool end of the ramp, set back so the work reads
        // as the thing that matters.
        seg.kind === "rest" && "opacity-55",
      )}
    />
  );
}
