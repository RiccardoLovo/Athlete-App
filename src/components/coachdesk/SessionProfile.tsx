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
  showTotals = false,
  className,
}: {
  blocks: (BlockLike & { id: string })[];
  rounds: (RoundLike & { workout_block_id?: string | null })[];
  discipline: string | null | undefined;
  /** The coach's builder shows totals; the athlete's summary does not. */
  showTotals?: boolean;
  className?: string;
}) {
  const profile = useMemo(
    () => buildProfile(blocks, rounds, discipline),
    [blocks, rounds, discipline],
  );

  // A chart that cannot be drawn to scale says less than the block list
  // beneath it, so it stays out of the way until the session carries enough
  // to measure. Once a pace or duration is required this never happens.
  if (!profile.segments.length || !profile.axis) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {showTotals && <Totals profile={profile} blocks={blocks.length} />}
      <div>
        <div className="flex h-20 items-end gap-[3px]">
          {profile.segments.map((s) => (
            <Bar key={s.key} seg={s} profile={profile} />
          ))}
        </div>
        <Axis profile={profile} />
      </div>
    </div>
  );
}

function Totals({ profile, blocks }: { profile: Profile; blocks: number }) {
  const items: { label: string; value: string; unit?: string }[] = [];
  if (profile.totalMin != null)
    items.push({
      label: "Time",
      value: String(Math.round(profile.totalMin)),
      unit: "MIN",
    });
  if (profile.totalKm != null)
    items.push({
      label: "Distance",
      value: String(Math.round(profile.totalKm * 100) / 100),
      unit: "KM",
    });
  if (profile.hardestZone != null)
    items.push({ label: "Hardest zone", value: `Z${profile.hardestZone}` });
  items.push({ label: "Blocks", value: String(blocks) });

  return (
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
  );
}

function Axis({ profile }: { profile: Profile }) {
  const unit = profile.axis === "km" ? "km" : "'";
  const ticks = profileTicks(profile.total, profile.axis);
  if (ticks.length < 2) return null;

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
