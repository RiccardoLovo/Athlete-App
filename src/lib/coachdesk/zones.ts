// Z1-Z5 training zone math, driven by the athlete's own threshold tests
// (bike FTP in watts, swim CSS as a pace). Bike zones are straightforward
// %FTP bands (power scales linearly with effort). Swim zones are NOT a
// percentage of CSS — CSS is itself a pace, and slower effort means a
// larger (slower) number, so swim zones are expressed as a pace *offset*
// from CSS instead, in seconds per 100m.

export type ZoneNumber = 1 | 2 | 3 | 4 | 5;

/**
 * Every threshold an athlete can have on file. One list, because the set
 * had started to live in three places — the database constraint, the
 * dialog that writes them and the hook that reads them — and they will
 * not stay in step by hand.
 */
export const THRESHOLD_METRICS = [
  "ftp_watts",
  "css_pace_sec_per_100m",
  "run_threshold_pace_sec_per_km",
  "bike_speed_kmh",
  "lthr_bpm",
  "max_hr_bpm",
] as const;

export type ThresholdMetric = (typeof THRESHOLD_METRICS)[number];

export const ZONE_LABELS: Record<ZoneNumber, string> = {
  1: "Recovery",
  2: "Endurance",
  3: "Tempo",
  4: "Threshold",
  5: "VO2max",
};

// Coggan-style power zones, as a fraction of FTP.
export const BIKE_ZONES: Record<ZoneNumber, { min: number; max: number }> = {
  1: { min: 0, max: 0.55 },
  2: { min: 0.55, max: 0.75 },
  3: { min: 0.76, max: 0.9 },
  4: { min: 0.91, max: 1.05 },
  5: { min: 1.06, max: 1.2 },
};

// Swim zone pace offset from CSS, in seconds per 100m. Positive = slower
// (recovery/easy), negative = faster (sprint/VO2max).
export const SWIM_ZONE_OFFSET_SEC: Record<ZoneNumber, number> = {
  1: 12,
  2: 7,
  3: 3,
  4: 0,
  5: -4,
};

// Run zone pace offset from threshold pace, in seconds per km. Same shape
// as the swim offsets: positive = slower, negative = faster. Threshold
// pace is roughly what an athlete holds for an hour, which puts Z4 on it
// and the easy zones a long way behind — a minute per km of difference
// between easy and threshold is normal and deliberate.
export const RUN_ZONE_OFFSET_SEC: Record<ZoneNumber, number> = {
  1: 90,
  2: 60,
  3: 25,
  4: 0,
  5: -12,
};

/** Threshold pace (sec/km) + zone offset -> that zone's pace, in sec/km. */
export function runZonePaceSec(
  thresholdSecPerKm: number,
  zone: ZoneNumber,
): number {
  return Math.max(1, Math.round(thresholdSecPerKm + RUN_ZONE_OFFSET_SEC[zone]));
}

// Heart-rate zones as a percentage band per zone. Two references, because
// athletes know one or the other.
//
// Threshold heart rate is preferred: it is measured like the pace and
// power thresholds, so Z4 lands on threshold in every discipline and the
// zones mean the same thing across them. Percentages follow the common
// LTHR scheme, where threshold sits at the top of Z4.
export const HR_ZONE_PCT_LTHR: Record<
  ZoneNumber,
  { min: number; max: number }
> = {
  1: { min: 0.7, max: 0.81 },
  2: { min: 0.81, max: 0.89 },
  3: { min: 0.9, max: 0.93 },
  4: { min: 0.94, max: 0.99 },
  5: { min: 1.0, max: 1.06 },
};

// Fallback on maximum heart rate, which more athletes can quote but which
// places the zones less precisely — max HR is a ceiling, not a threshold,
// and two athletes with the same ceiling can have very different ones.
export const HR_ZONE_PCT_MAX: Record<ZoneNumber, { min: number; max: number }> =
  {
    1: { min: 0.5, max: 0.6 },
    2: { min: 0.6, max: 0.7 },
    3: { min: 0.7, max: 0.8 },
    4: { min: 0.8, max: 0.9 },
    5: { min: 0.9, max: 1.0 },
  };

/**
 * The heart-rate band for a zone, in bpm. Returns null when neither
 * reference is on file rather than guessing one from age — an age-
 * predicted maximum is wrong by ten beats or more for most people, which
 * is an entire zone.
 */
export function hrZoneBpm(
  zone: ZoneNumber,
  refs: { lthrBpm?: number | null; maxHrBpm?: number | null },
): { min: number; max: number; basis: "lthr" | "max" } | null {
  if (refs.lthrBpm != null && refs.lthrBpm > 0) {
    const b = HR_ZONE_PCT_LTHR[zone];
    return {
      min: Math.round(refs.lthrBpm * b.min),
      max: Math.round(refs.lthrBpm * b.max),
      basis: "lthr",
    };
  }
  if (refs.maxHrBpm != null && refs.maxHrBpm > 0) {
    const b = HR_ZONE_PCT_MAX[zone];
    return {
      min: Math.round(refs.maxHrBpm * b.min),
      max: Math.round(refs.maxHrBpm * b.max),
      basis: "max",
    };
  }
  return null;
}

/** "139–147 bpm" */
export function formatHrBand(band: { min: number; max: number }): string {
  return `${band.min}–${band.max} bpm`;
}

export function bikeZoneWatts(
  ftpWatts: number,
  zone: ZoneNumber,
): { min: number; max: number } {
  const z = BIKE_ZONES[zone];
  return {
    min: Math.round(ftpWatts * z.min),
    max: Math.round(ftpWatts * z.max),
  };
}

// Midpoint watt target for a zone — handy for a single auto-filled value
// rather than a range.
export function bikeZoneWattsMid(ftpWatts: number, zone: ZoneNumber): number {
  const { min, max } = bikeZoneWatts(ftpWatts, zone);
  return Math.round((min + max) / 2);
}

// CSS pace (sec/100m) + zone offset -> target pace for that zone, in
// seconds per 100m.
export function swimZonePaceSec(
  cssSecPer100m: number,
  zone: ZoneNumber,
): number {
  return Math.max(1, Math.round(cssSecPer100m + SWIM_ZONE_OFFSET_SEC[zone]));
}

// Exact-percentage variants, for callers that want a precise %FTP/%CSS
// rather than the Z1-Z5 bucket (the structured-workout block builder uses
// the zone as a quick starting point, then lets the coach dial in an
// exact percentage from there — these are the "dial in" functions).
export function bikePctToWatts(ftpWatts: number, pct: number): number {
  return Math.round(ftpWatts * (pct / 100));
}

// %CSS here means % of CSS *speed*, matching how swim coaches talk about
// it (105% CSS = swimming faster than CSS pace) — not a pace percentage,
// since pace and speed move in opposite directions.
export function swimPctToPaceSec(cssSecPer100m: number, pct: number): number {
  return Math.max(1, Math.round((cssSecPer100m * 100) / pct));
}

// Default %FTP for a zone (its band's midpoint) — a starting point before
// the coach fine-tunes to an exact number.
export function bikeZoneDefaultPct(zone: ZoneNumber): number {
  const z = BIKE_ZONES[zone];
  return Math.round(((z.min + z.max) / 2) * 100);
}

// Default %CSS for a zone, derived from the zone's pace offset converted
// to a speed percentage (so the two zone systems agree on their starting
// point even though one is offset-based and the other percentage-based).
export function swimZoneDefaultPct(
  cssSecPer100m: number,
  zone: ZoneNumber,
): number {
  const targetSec = swimZonePaceSec(cssSecPer100m, zone);
  return Math.round((cssSecPer100m / targetSec) * 100);
}

// "1:32" -> 92. Returns null for anything unparseable.
export function parsePaceToSeconds(pace: string): number | null {
  const m = pace.trim().match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// 92 -> "1:32"
export function formatSecondsToPace(totalSec: number): string {
  const sec = Math.round(totalSec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Reverse lookups: percentage -> zone. The coach may set either end, and the
// other must follow, so these mirror bikeZoneDefaultPct / swimZoneDefaultPct.
// ---------------------------------------------------------------------------

/** Which Coggan band a %FTP falls in. Nearest band if it sits in a gap. */
export function bikePctToZone(pct: number): ZoneNumber | null {
  if (!Number.isFinite(pct) || pct <= 0) return null;
  const f = pct / 100;
  for (const z of [1, 2, 3, 4, 5] as ZoneNumber[]) {
    const { min, max } = BIKE_ZONES[z];
    if (f > min && f <= max) return z;
  }
  // Above the top band is still Z5; below the first is Z1.
  return f > BIKE_ZONES[5].max ? 5 : 1;
}

/** Which swim zone a %CSS is closest to, using each zone's own default %. */
export function swimPctToZone(
  cssSecPer100m: number,
  pct: number,
): ZoneNumber | null {
  if (!Number.isFinite(pct) || pct <= 0) return null;
  let best: ZoneNumber | null = null;
  let bestGap = Infinity;
  for (const z of [1, 2, 3, 4, 5] as ZoneNumber[]) {
    const gap = Math.abs(swimZoneDefaultPct(cssSecPer100m, z) - pct);
    if (gap < bestGap) {
      bestGap = gap;
      best = z;
    }
  }
  return best;
}

/** The %FTP band a zone spans, for showing the range beside the number. */
export function bikeZoneRangePct(zone: ZoneNumber): {
  min: number;
  max: number;
} {
  const z = BIKE_ZONES[zone];
  return { min: Math.round(z.min * 100), max: Math.round(z.max * 100) };
}
