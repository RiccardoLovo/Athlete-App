// Rest is expressed the same way everywhere in the app — on a generated
// round, on a hand-edited round, and on a structured block: either a flat
// number of whole seconds, or a work:rest ratio.
//
// Storage: `rest_ratio` is the *rest* side with work normalised to 1, so
// 1 = 1:1, 2 = 1:2 (rest twice the work), 0.5 = 2:1 (work twice the rest).

export type RestMode = "seconds" | "ratio";

export type RestValue = {
  rest_mode: RestMode;
  rest_seconds: number | null;
  rest_ratio: number | null;
};

/** What the generators take: one mode plus the single relevant number. */
export type RestSpec = { mode: RestMode; value: number | null };

export const DEFAULT_REST: RestValue = {
  rest_mode: "seconds",
  rest_seconds: 60,
  rest_ratio: null,
};

/** The ratios a coach actually prescribes, labelled work:rest. */
export const REST_RATIO_OPTIONS: { value: number; label: string }[] = [
  { value: 1 / 3, label: "3:1" },
  { value: 0.5, label: "2:1" },
  { value: 1, label: "1:1" },
  { value: 1.5, label: "1:1.5" },
  { value: 2, label: "1:2" },
  { value: 3, label: "1:3" },
];

/** Ratio options are stored as floats (1/3), so match with a tolerance. */
export function ratioOptionValue(ratio: number | null): string {
  if (ratio == null) return "";
  const hit = REST_RATIO_OPTIONS.find((o) => Math.abs(o.value - ratio) < 0.005);
  return hit ? String(hit.value) : "";
}

/** "1:1", "2:1" — falls back to a derived label for legacy free-typed values. */
export function formatRestRatio(ratio: number | null): string | null {
  if (ratio == null) return null;
  const hit = REST_RATIO_OPTIONS.find((o) => Math.abs(o.value - ratio) < 0.005);
  if (hit) return hit.label;
  return ratio >= 1
    ? `1:${Math.round(ratio * 100) / 100}`
    : `${Math.round((1 / ratio) * 100) / 100}:1`;
}

/** Human-readable rest for read-only views: "rest 45s" / "rest 1:1". */
export function restText(v: {
  rest_mode?: RestMode | null;
  rest_seconds?: number | null;
  rest_ratio?: number | null;
}): string | null {
  if (v.rest_mode === "ratio") {
    const label = formatRestRatio(v.rest_ratio ?? null);
    return label ? `rest ${label}` : null;
  }
  return v.rest_seconds == null ? null : `rest ${Math.round(v.rest_seconds)}s`;
}

export function restSpecOf(v: RestValue): RestSpec {
  return {
    mode: v.rest_mode,
    value: v.rest_mode === "ratio" ? v.rest_ratio : v.rest_seconds,
  };
}

/** Switch mode while keeping a sensible number on the side being switched to. */
export function withRestMode(v: RestValue, mode: RestMode): RestValue {
  if (mode === v.rest_mode) return v;
  return mode === "ratio"
    ? { rest_mode: "ratio", rest_seconds: null, rest_ratio: v.rest_ratio ?? 1 }
    : {
        rest_mode: "seconds",
        rest_ratio: null,
        rest_seconds: v.rest_seconds ?? 60,
      };
}
