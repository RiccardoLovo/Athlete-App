import {
  blockIntensity,
  blockTarget,
  type BlockLike,
} from "@/lib/coachdesk/blocks";
import { zoneText } from "@/lib/coachdesk/zoneColors";

/**
 * A block read as a sentence rather than a form: "15 min at 6:05–6:32/km".
 *
 * Shared by the coach's builder and the athlete's logging screen so that
 * both are reading the same words — the prescription should not be phrased
 * one way to the person writing it and another to the person doing it.
 */
export function BlockLine({ block }: { block: BlockLike }) {
  const target = blockTarget(block);
  const { primary, indicative } = blockIntensity(block);
  const [qty, unit] = target ? splitTarget(target) : [null, null];

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
            className={`text-sm tabular-nums ${zoneText(block.zone, "text-foreground")}`}
          >
            {primary}
          </span>
        </>
      )}
      {indicative && (
        <span className="font-mono text-[11px] text-muted-foreground">
          {indicative}
        </span>
      )}
    </div>
  );
}

/** "15 min" -> ["15", "min"], keeping the number and its unit separable. */
function splitTarget(target: string): [string, string] {
  const i = target.indexOf(" ");
  return i === -1 ? [target, ""] : [target.slice(0, i), target.slice(i + 1)];
}
