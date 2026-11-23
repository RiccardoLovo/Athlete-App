import { restText } from "./rest";

// One description of a structured workout block, used by every surface that
// shows one: the coach's collapsed card, the athlete's read-only summary and
// the PDF. They drifted apart once already — the PDF simply did not render
// blocks at all — so the formatting lives here rather than in each renderer.

export const BLOCK_LABELS: Record<string, string> = {
  warmup: "Warm-up",
  cooldown: "Cool-down",
  steady: "Steady",
  drill: "Drill",
  intervals: "Intervals",
  pyramid: "Pyramid",
};

export type BlockLike = {
  block_type: string;
  label?: string | null;
  target_mode?: string | null;
  target_unit?: string | null;
  intensity_mode?: string | null;
  distance_km?: number | null;
  duration_min?: number | null;
  pace?: string | null;
  zone?: number | null;
  pct_threshold?: number | null;
  /** What the zone is measured against: a pace/power band, or heart rate. */
  zone_basis?: "pace" | "hr" | null;
  /**
   * What the coach wants the athlete to feel or watch for in this step —
   * "stay tall on the last two", "this should feel easy". The builder has
   * had a field for it since blocks existed and nothing ever rendered it,
   * so every note a coach wrote went nowhere.
   */
  notes?: string | null;
  // An interval block may carry only a count and a block-level rest, with no
  // prescription_intervals rows behind it — that is how the plain builder
  // writes them, and the session profile has to be able to draw those too.
  interval_count?: number | null;
  rest_mode?: "seconds" | "ratio" | null;
  rest_seconds?: number | null;
  rest_ratio?: number | null;
};

export type RoundLike = {
  target_value?: number | null;
  target_unit?: string | null;
  pace_per_km?: string | null;
  hr_zone?: number | null;
  watts?: number | null;
  cadence?: number | null;
  stroke?: string | null;
  intensity?: string | null;
  rest_seconds?: number | null;
  rest_mode?: "seconds" | "ratio" | null;
  rest_ratio?: number | null;
  rest_type?: "passive" | "active" | null;
};

export const ROUND_UNIT: Record<string, string> = {
  meters: "m",
  seconds: "s",
  minutes: "min",
};

/** The target as the coach entered it, in the unit they chose. */
export function blockTarget(b: BlockLike): string | null {
  if (b.target_mode === "time") {
    if (b.duration_min == null) return null;
    return b.target_unit === "sec"
      ? `${Math.round(b.duration_min * 60)} sec`
      : `${b.duration_min} min`;
  }
  if (b.distance_km == null) return null;
  return b.target_unit === "m"
    ? `${Math.round(b.distance_km * 1000)} m`
    : `${b.distance_km} km`;
}

/**
 * The intensity split into the one the athlete must hold and the one that is
 * only indicative. Which is which depends on intensity_mode: "zone" means
 * follow the zone, "threshold" the %FTP/%CSS, "pace" the pace.
 */
export function blockIntensity(b: BlockLike): {
  primary: string | null;
  indicative: string | null;
} {
  const zone = b.zone != null ? `Z${b.zone}` : null;
  const pct = b.pct_threshold != null ? `${b.pct_threshold}%` : null;
  const zoneAndPct = [zone, pct].filter(Boolean).join(" ") || null;

  if (b.intensity_mode === "pace")
    return { primary: b.pace || null, indicative: zoneAndPct };
  if (b.intensity_mode === "threshold")
    return {
      primary: pct,
      indicative: [zone, b.pace].filter(Boolean).join(" ") || null,
    };
  // Default and "zone": the zone is binding, the rest is guidance.
  return { primary: zoneAndPct, indicative: b.pace || null };
}

/** One round on one line: "3 · 1000m · Z4 · 4:00/km". */
export function roundLine(r: RoundLike, index: number): string {
  const unit = ROUND_UNIT[r.target_unit ?? ""] ?? r.target_unit ?? "";
  const bits = [
    `${index + 1}`,
    r.target_value != null ? `${r.target_value}${unit}` : "—",
    r.stroke || null,
    r.intensity || (r.hr_zone != null ? `Z${r.hr_zone}` : null),
    r.pace_per_km ||
      (r.watts != null ? `${r.watts}W` : null) ||
      (r.cadence != null ? `${r.cadence}rpm` : null),
  ].filter(Boolean);
  return bits.join("  ·  ");
}

/** The rest that follows a round, if any. */
export function roundRest(r: RoundLike): string | null {
  const rest = restText(r);
  if (!rest) return null;
  return r.rest_type === "active"
    ? rest.replace("rest ", "active rest ")
    : rest;
}

/** Does this block hold its own rounds rather than a single target? */
export function blockHasRounds(blockType: string): boolean {
  return blockType === "intervals" || blockType === "pyramid";
}

/**
 * Read one interval round as if it were a block, so the same renderer can
 * say it.
 *
 * The flat interval model predates structured blocks and has its own
 * vocabulary: target_value plus target_unit where a block carries
 * duration_min or distance_km, and hr_zone where a block carries zone
 * plus zone_basis. The two describe the same thing, and the athlete
 * should not get a worse sentence for a session that happens to be
 * written in the older shape.
 *
 * hr_zone maps to a heart-rate zone, not a pace band — that is what the
 * column means and what the old table said ("HR Z3") — so the sentence
 * can resolve it to real beats from the athlete's own zones.
 */
export function roundAsBlock(
  r: RoundLike & { label?: string | null },
): BlockLike {
  const v = r.target_value == null ? null : Number(r.target_value);
  const unit = (r.target_unit ?? "").toLowerCase();
  const isTime = unit === "minutes" || unit === "seconds";
  return {
    block_type: "intervals",
    label: r.label ?? null,
    target_mode: isTime ? "time" : v == null ? null : "distance",
    target_unit: isTime ? "min" : "km",
    duration_min: v == null || !isTime ? null : unit === "seconds" ? v / 60 : v,
    distance_km: v == null || isTime ? null : unit === "meters" ? v / 1000 : v,
    pace: r.pace_per_km ?? null,
    zone: r.hr_zone ?? null,
    zone_basis: r.hr_zone == null ? null : "hr",
    intensity_mode: r.pace_per_km ? "pace" : "zone",
  };
}
