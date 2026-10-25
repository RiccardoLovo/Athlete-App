// Z1-Z5 training zone math, driven by the athlete's own threshold tests
// (bike FTP in watts, swim CSS as a pace). Bike zones are straightforward
// %FTP bands (power scales linearly with effort). Swim zones are NOT a
// percentage of CSS — CSS is itself a pace, and slower effort means a
// larger (slower) number, so swim zones are expressed as a pace *offset*
// from CSS instead, in seconds per 100m.

export type ZoneNumber = 1 | 2 | 3 | 4 | 5;

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
