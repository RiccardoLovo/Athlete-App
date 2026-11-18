import { useEffect, useRef } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { parsePaceToSeconds, formatSecondsToPace } from "@/lib/coachdesk/zones";
import { cn } from "@/lib/utils";

// Pace used to be a free-text field, which meant a coach could type
// something no code could read — and the chart, the estimates and the
// volume figures all need a number. Picking minutes and seconds from a
// wheel makes an unparseable pace impossible to enter rather than
// something to validate after the fact.

type Range = { minMin: number; maxMin: number; label: string };

/** Sensible bounds per sport, so the wheel is short enough to flick. */
export function paceRange(discipline: string | null | undefined): Range {
  if (discipline === "Swimming")
    return { minMin: 1, maxMin: 4, label: "/100m" };
  return { minMin: 2, maxMin: 12, label: "/km" };
}

export function PacePicker({
  value,
  onChange,
  discipline,
  placeholder = "Pace",
  dimmed = false,
  title,
  className,
}: {
  /** "m:ss", or empty. */
  value: string | null;
  onChange: (next: string | null) => void;
  discipline: string | null | undefined;
  placeholder?: string;
  dimmed?: boolean;
  title?: string;
  className?: string;
}) {
  const range = paceRange(discipline);
  const total = parsePaceToSeconds(value ?? "");
  const mins = total == null ? null : Math.floor(total / 60);
  const secs = total == null ? null : Math.round(total % 60);

  const minOptions = Array.from(
    { length: range.maxMin - range.minMin + 1 },
    (_, i) => range.minMin + i,
  );
  // Five-second steps: nobody prescribes a pace to the second, and a
  // sixty-row wheel is a worse way to pick one.
  const secOptions = Array.from({ length: 12 }, (_, i) => i * 5);

  function set(nextMin: number | null, nextSec: number | null) {
    const m = nextMin ?? mins ?? range.minMin;
    const s = nextSec ?? secs ?? 0;
    onChange(formatSecondsToPace(m * 60 + s));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          title={title}
          className={cn(
            "h-7 w-[84px] justify-center px-2 font-mono text-xs tabular-nums",
            dimmed && "opacity-50",
            !value && "text-muted-foreground",
            className,
          )}
        >
          {value ? `${value}${range.label}` : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex items-stretch gap-1">
          <Wheel
            options={minOptions}
            selected={mins}
            format={(n) => String(n)}
            onPick={(n) => set(n, null)}
            label="min"
          />
          <span className="self-center pb-4 font-mono text-sm">:</span>
          <Wheel
            options={secOptions}
            selected={secs == null ? null : Math.round(secs / 5) * 5}
            format={(n) => String(n).padStart(2, "0")}
            onPick={(n) => set(null, n)}
            label="sec"
          />
          <div className="flex flex-col justify-end pb-1 pl-1">
            <span className="px-1 font-mono text-[10px] text-muted-foreground">
              {range.label}
            </span>
          </div>
        </div>
        {value && (
          <button
            type="button"
            className="mt-2 w-full rounded border border-border py-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => onChange(null)}
          >
            Clear
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Wheel({
  options,
  selected,
  format,
  onPick,
  label,
}: {
  options: number[];
  selected: number | null;
  format: (n: number) => string;
  onPick: (n: number) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Open on the current value rather than at the top of the list.
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[data-selected=true]");
    el?.scrollIntoView({ block: "center" });
  }, [selected]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={ref}
        className="h-32 w-14 overflow-y-auto rounded-md border border-border"
      >
        {options.map((n) => {
          const on = n === selected;
          return (
            <button
              key={n}
              type="button"
              data-selected={on}
              onClick={() => onPick(n)}
              className={cn(
                "block w-full py-1.5 text-center font-mono text-sm tabular-nums",
                on
                  ? "bg-foreground font-semibold text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {format(n)}
            </button>
          );
        })}
      </div>
      <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
