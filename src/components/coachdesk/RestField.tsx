import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  REST_RATIO_OPTIONS,
  ratioOptionValue,
  withRestMode,
  type RestMode,
  type RestValue,
} from "@/lib/coachdesk/rest";

/**
 * The one rest control used everywhere rest is prescribed. In `seconds`
 * mode it takes whole seconds only; in `ratio` mode it offers the ratios
 * a coach actually uses (3:1 … 1:3) rather than a free number.
 */
export function RestField({
  value,
  onChange,
  valueWidth = "w-14",
  modeWidth = "w-[72px]",
}: {
  value: RestValue;
  onChange: (next: RestValue) => void;
  valueWidth?: string;
  modeWidth?: string;
}) {
  const isRatio = value.rest_mode === "ratio";

  return (
    <div className="flex items-center gap-1">
      {isRatio ? (
        <Select
          value={ratioOptionValue(value.rest_ratio)}
          onValueChange={(v) =>
            onChange({ ...value, rest_mode: "ratio", rest_ratio: Number(v) })
          }
        >
          <SelectTrigger
            className={`h-7 text-xs ${valueWidth}`}
            title="Work:rest ratio"
          >
            <SelectValue placeholder="1:1" />
          </SelectTrigger>
          <SelectContent>
            {REST_RATIO_OPTIONS.map((o) => (
              <SelectItem key={o.label} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          className={`h-7 text-xs ${valueWidth}`}
          type="number"
          // Whole seconds only — no decimals.
          step={1}
          min={0}
          placeholder="s"
          value={value.rest_seconds ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            const n = raw === "" ? null : Math.max(0, Math.round(Number(raw)));
            onChange({
              ...value,
              rest_mode: "seconds",
              rest_seconds: n != null && Number.isFinite(n) ? n : null,
            });
          }}
          onKeyDown={(e) => {
            // Block the decimal separators the spinner would otherwise accept.
            if (e.key === "." || e.key === ",") e.preventDefault();
          }}
        />
      )}
      <Select
        value={value.rest_mode}
        onValueChange={(v) => onChange(withRestMode(value, v as RestMode))}
      >
        <SelectTrigger className={`h-7 text-xs ${modeWidth}`} title="Rest unit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="seconds">sec</SelectItem>
          <SelectItem value="ratio">ratio</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
