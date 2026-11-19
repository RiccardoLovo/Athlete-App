import { Heart } from "lucide-react";
import {
  blockIntensity,
  blockTarget,
  type BlockLike,
} from "@/lib/coachdesk/blocks";
import { zoneText } from "@/lib/coachdesk/zoneColors";
import {
  formatHrBand,
  hrZoneBpm,
  type ZoneNumber,
} from "@/lib/coachdesk/zones";
import { useLatestThreshold } from "./IntervalBuilder";
import { useOwnHrZones } from "./HrZonesEditor";

/**
 * A block read as a sentence rather than a form: "15 min at 6:05/km".
 *
 * Shared by the coach's builder and the athlete's logging screen so that
 * both are reading the same words — the prescription should not be phrased
 * one way to the person writing it and another to the person doing it.
 *
 * Where the coach said to hold the zone by heart rate, that is what the
 * line says, in beats: a pace-based Z2 and a heart-rate Z2 are different
 * instructions and showing the wrong one would be worse than showing none.
 */
export function BlockLine({
  block,
  clientId,
  discipline,
}: {
  block: BlockLike;
  /** Needed to turn a heart-rate zone into actual beats. */
  clientId?: string | null;
  /** Friel publishes different %LTHR bands per sport, so the band for a
   *  zone depends on which one this block belongs to. */
  discipline?: string | null;
}) {
  const byHr = block.zone_basis === "hr";
  const { data: lthrBpm } = useLatestThreshold(
    byHr ? clientId : null,
    "lthr_bpm",
  );
  const { data: maxHrBpm } = useLatestThreshold(
    byHr ? clientId : null,
    "max_hr_bpm",
  );
  const { data: ownZones } = useOwnHrZones(byHr ? clientId : null);

  const target = blockTarget(block);
  const { primary, indicative } = blockIntensity(block);
  const [qty, unit] = target ? splitTarget(target) : [null, null];

  const band =
    byHr && block.zone != null
      ? hrZoneBpm(block.zone as ZoneNumber, discipline, {
          lthrBpm,
          maxHrBpm,
          explicit: ownZones,
        })
      : null;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-1">
      {block.label && <span className="text-sm">{block.label}</span>}
      {qty ? (
        <span className="text-base font-medium tabular-nums">
          {qty}
          <span className="ml-0.5 text-[11px] font-normal italic text-muted-foreground">
            {unit}
          </span>
        </span>
      ) : (
        <span className="text-xs italic text-muted-foreground">
          no target yet
        </span>
      )}

      {primary && (
        <>
          <span className="text-xs text-muted-foreground">at</span>
          <span
            className={`inline-flex items-baseline gap-1 text-sm tabular-nums ${zoneText(
              block.zone,
              "text-foreground",
            )}`}
          >
            {byHr && (
              <Heart className="h-3 w-3 shrink-0 self-center" aria-hidden />
            )}
            {primary}
          </span>
        </>
      )}

      {/* Beats where we can work them out; otherwise say the zone is a
          heart-rate one and that the reference is missing, rather than
          letting it read like a pace zone. */}
      {byHr && block.zone != null && (
        <span className="font-mono text-[11px] text-muted-foreground">
          {band
            ? `${formatHrBand(band)}${band.approximate ? " approx." : ""}`
            : "no HR reference on file"}
        </span>
      )}

      {!byHr && indicative && (
        <span className="font-mono text-[11px] text-muted-foreground">
          {indicative}
        </span>
      )}

      {/* The coach's note for this step. The builder has had a field for
          it since blocks existed and no surface ever rendered it, so every
          note written here was saved and shown to nobody — including back
          to the coach outside the editor. It breaks to its own line
          because it is a sentence, not another number in the series. */}
      {block.notes?.trim() && (
        <p className="w-full text-xs italic text-muted-foreground">
          {block.notes.trim()}
        </p>
      )}
    </div>
  );
}

/** "15 min" -> ["15", "min"], keeping the number and its unit separable. */
function splitTarget(target: string): [string, string] {
  const i = target.indexOf(" ");
  return i === -1 ? [target, ""] : [target.slice(0, i), target.slice(i + 1)];
}
