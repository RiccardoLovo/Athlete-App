import type { RestSpec } from "./rest";

// Pure template generators for interval prescriptions.
// Each returns an array of row inputs ready to insert into
// `prescription_intervals`. The caller assigns `session_exercise_id`
// and `order_index`.

export type IntervalRowInput = {
  label: string | null;
  target_value: number | null;
  target_unit: "meters" | "seconds" | "minutes";
  pace_per_km: string | null;
  hr_zone: number | null;
  watts: number | null;
  cadence: number | null;
  stroke: string | null;
  intensity: string | null;
  rest_seconds: number | null;
  rest_type: "passive" | "active";
  // Rest can be a flat number of seconds or a work:rest ratio (1 = 1:1).
  rest_mode?: "seconds" | "ratio";
  rest_ratio?: number | null;
};

function blank(): IntervalRowInput {
  return {
    label: null,
    target_value: null,
    target_unit: "meters",
    pace_per_km: null,
    hr_zone: null,
    watts: null,
    cadence: null,
    stroke: null,
    intensity: null,
    rest_seconds: null,
    rest_type: "passive",
    rest_mode: "seconds",
    rest_ratio: null,
  };
}

/** How rest is expressed for generated rounds: a flat number of seconds,
 *  or a work:rest ratio (1 = 1:1) stored on each round. */
export type { RestSpec } from "./rest";

function restFields(rest: RestSpec) {
  return rest.mode === "ratio"
    ? {
        rest_mode: "ratio" as const,
        rest_ratio: rest.value ?? 1,
        rest_seconds: null,
      }
    : {
        rest_mode: "seconds" as const,
        rest_ratio: null,
        rest_seconds: rest.value,
      };
}

export type RsaParams = {
  sprint_count: number;
  sprint_distance_m: number;
  rest: RestSpec;
  intensity?: string | null;
};

export function generateRsa(p: RsaParams): IntervalRowInput[] {
  const n = Math.max(1, Math.min(20, Math.floor(p.sprint_count)));
  const out: IntervalRowInput[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      ...blank(),
      label: `Sprint ${i + 1}`,
      target_value: p.sprint_distance_m,
      target_unit: "meters",
      intensity: p.intensity ?? "max",
      ...(i === n - 1
        ? {
            rest_mode: "seconds" as const,
            rest_ratio: null,
            rest_seconds: null,
          }
        : restFields(p.rest)),
      rest_type: "passive",
    });
  }
  return out;
}

export type PyramidParams = {
  start_m: number;
  peak_m: number;
  step_m: number;
  rest: RestSpec;
  /** Repeat the peak step twice before descending. */
  double_peak?: boolean;
};

export type PyramidResult = {
  rows: IntervalRowInput[];
  /** Adjusted peak if it didn't divide evenly. */
  effectivePeak: number;
  warning?: string;
};

export function generatePyramid(p: PyramidParams): PyramidResult {
  if (!(p.peak_m > p.start_m)) {
    return {
      rows: [],
      effectivePeak: p.peak_m,
      warning: "Peak must be greater than start.",
    };
  }
  const range = p.peak_m - p.start_m;
  const steps = Math.floor(range / p.step_m);
  const effectivePeak = p.start_m + steps * p.step_m;
  const warning =
    effectivePeak !== p.peak_m
      ? `Peak adjusted to ${effectivePeak}m to match step size.`
      : undefined;

  const rows: IntervalRowInput[] = [];
  // Ascending: start, start+step, ..., peak
  for (let i = 0; i <= steps; i++) {
    const dist = p.start_m + i * p.step_m;
    rows.push({
      ...blank(),
      label: i === steps ? "Peak" : `Build ${i + 1}`,
      target_value: dist,
      target_unit: "meters",
      ...restFields(p.rest),
      rest_type: "passive",
    });
    if (i === steps && p.double_peak) {
      rows.push({
        ...blank(),
        label: "Peak 2",
        target_value: dist,
        target_unit: "meters",
        ...restFields(p.rest),
        rest_type: "passive",
      });
    }
  }
  // Descending: peak-step, ..., start
  for (let i = steps - 1; i >= 0; i--) {
    const dist = p.start_m + i * p.step_m;
    rows.push({
      ...blank(),
      label: `Descend ${steps - i}`,
      target_value: dist,
      target_unit: "meters",
      ...restFields(p.rest),
      rest_type: "passive",
    });
  }
  // Last row no rest
  if (rows.length) {
    rows[rows.length - 1].rest_seconds = null;
    rows[rows.length - 1].rest_ratio = null;
  }

  return { rows, effectivePeak, warning };
}
