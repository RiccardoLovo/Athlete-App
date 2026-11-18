import {
  parsePaceToSeconds,
  runZonePaceSec,
  swimZonePaceSec,
  type ZoneNumber,
} from "./zones";
import type { BlockLike, RoundLike } from "./blocks";
import { blockHasRounds } from "./blocks";

// The shape of a session: one bar per thing the athlete does, width by how
// long or how far it is, height by intensity.
//
// The axis is chosen from the data rather than demanded of it. Minutes are
// best, but a session prescribed purely in kilometres is still perfectly
// drawable against a distance axis, and one that says only "6 intervals" can
// still show six bars. What we never do is invent a width and present it as
// scale — a bar that lies is worse than a bar that admits it cannot measure.

export type ProfileKind = "work" | "rest";
export type ProfileAxis = "min" | "km" | null;

/** Where a number came from, so the screen can say when it is a guess. */
export type Provenance = "prescribed" | "pace" | "zone" | "speed" | null;

export type ProfileSegment = {
  key: string;
  kind: ProfileKind;
  label: string;
  durationMin: number | null;
  distanceKm: number | null;
  /** "prescribed" = the coach set it. Anything else was worked out. */
  durationFrom: Provenance;
  distanceFrom: Provenance;
  zone: number | null;
  blockType: string;
};

export type Profile = {
  segments: ProfileSegment[];
  /** "min" and "km" are to scale; null means structure only. */
  axis: ProfileAxis;
  /** Total along that axis, 0 when there is no axis. */
  total: number;
  /** Session totals, each null unless every block contributes one. */
  totalMin: number | null;
  totalKm: number | null;
  hardestZone: number | null;
  /** True when any part of that total was worked out rather than set. */
  minEstimated: boolean;
  kmEstimated: boolean;
  /** What the estimates lean on, for the footnote. */
  estimatedFrom: ("pace" | "zone" | "speed")[];
  /** True when a duration was worked out from a pace rather than prescribed. */
  derived: boolean;
};

type Disc = string | null | undefined;

/** What the session can be measured against beyond the blocks themselves. */
export type ProfileContext = {
  /** Typical riding speed, km/h. The only way a ride prescribed in time
   *  gets a distance, or one prescribed in distance gets a duration. */
  bikeSpeedKmh?: number | null;
  /** Run threshold pace, seconds per km. */
  runThresholdSecPerKm?: number | null;
  /** Critical swim speed, seconds per 100 m. */
  cssSecPer100m?: number | null;
};

/**
 * The pace to reckon with, and where it came from.
 *
 * A pace the coach typed is used as given. Where they set only a zone,
 * the pace follows from the athlete's own threshold — the zone already
 * says how hard, and the threshold says what that is worth in minutes,
 * so there is no reason to make the coach type a number the app can
 * work out. Marked as coming from the zone so the screen can say so.
 */
function paceSecFor(
  pace: string | null | undefined,
  zone: number | null | undefined,
  discipline: Disc,
  ctx: ProfileContext,
): { sec: number; from: "pace" | "zone" } | null {
  const typed = parsePaceToSeconds(pace ?? "");
  if (typed != null && typed > 0) return { sec: typed, from: "pace" };

  if (zone == null) return null;
  const z = Math.min(5, Math.max(1, Math.round(zone))) as ZoneNumber;

  if (discipline === "Swimming" && ctx.cssSecPer100m)
    return { sec: swimZonePaceSec(ctx.cssSecPer100m, z), from: "zone" };
  if (discipline !== "Cycling" && ctx.runThresholdSecPerKm)
    return { sec: runZonePaceSec(ctx.runThresholdSecPerKm, z), from: "zone" };
  return null;
}

/**
 * Pace means seconds per km running and per 100 m swimming. Cycling is
 * prescribed in watts and carries no pace, so a ride given as distance has
 * no duration until the athlete has a recorded typical speed.
 */
function minutesFromDistance(
  km: number,
  pace: string | null | undefined,
  zone: number | null | undefined,
  discipline: Disc,
  ctx: ProfileContext,
): { min: number; from: "pace" | "zone" | "speed" } | null {
  // A ride is prescribed in watts, never in pace, so its duration can only
  // come from the athlete's own typical speed.
  if (discipline === "Cycling") {
    const kmh = ctx.bikeSpeedKmh;
    return kmh != null && kmh > 0
      ? { min: (km / kmh) * 60, from: "speed" }
      : null;
  }
  const p = paceSecFor(pace, zone, discipline, ctx);
  if (!p) return null;
  const min =
    discipline === "Swimming"
      ? ((km * 1000) / 100) * (p.sec / 60)
      : km * (p.sec / 60);
  return { min, from: p.from };
}

/** The other direction: how far a session prescribed in time will go. */
function distanceFromMinutes(
  min: number,
  zone: number | null | undefined,
  discipline: Disc,
  ctx: ProfileContext,
): { km: number; from: "pace" | "zone" | "speed" } | null {
  if (discipline === "Cycling") {
    const kmh = ctx.bikeSpeedKmh;
    return kmh != null && kmh > 0
      ? { km: (min / 60) * kmh, from: "speed" }
      : null;
  }
  const p = paceSecFor(null, zone, discipline, ctx);
  if (!p) return null;
  const km =
    discipline === "Swimming" ? (min * 60) / p.sec / 10 : (min * 60) / p.sec;
  return { km, from: p.from };
}

function roundDistanceKm(r: RoundLike): number | null {
  if (r.target_value == null) return null;
  return r.target_unit === "meters" ? Number(r.target_value) / 1000 : null;
}

function roundMinutes(
  r: RoundLike,
  zone: number | null | undefined,
  discipline: Disc,
  ctx: ProfileContext,
): { min: number; from: Provenance } | null {
  const v = r.target_value;
  if (v == null) return null;
  if (r.target_unit === "minutes")
    return { min: Number(v), from: "prescribed" };
  if (r.target_unit === "seconds")
    return { min: Number(v) / 60, from: "prescribed" };
  if (r.target_unit === "meters") {
    const d = minutesFromDistance(
      Number(v) / 1000,
      r.pace_per_km,
      r.hr_zone ?? zone,
      discipline,
      ctx,
    );
    return d ? { min: d.min, from: d.from } : null;
  }
  return null;
}

function restMinutes(
  rest: {
    rest_mode?: string | null;
    rest_seconds?: number | null;
    rest_ratio?: number | null;
  },
  workMin: number | null,
): number | null {
  if (rest.rest_mode === "ratio") {
    if (rest.rest_ratio == null || workMin == null) return null;
    return workMin * rest.rest_ratio;
  }
  return rest.rest_seconds == null ? null : rest.rest_seconds / 60;
}

function blockMinutes(
  b: BlockLike,
  discipline: Disc,
  ctx: ProfileContext,
): { min: number; from: Provenance } | null {
  if (b.target_mode === "time")
    return b.duration_min == null
      ? null
      : { min: Number(b.duration_min), from: "prescribed" };
  if (b.distance_km == null) return null;
  const d = minutesFromDistance(
    Number(b.distance_km),
    b.pace,
    b.zone,
    discipline,
    ctx,
  );
  return d ? { min: d.min, from: d.from } : null;
}

export function buildProfile(
  blocks: (BlockLike & { id: string })[],
  rounds: (RoundLike & { workout_block_id?: string | null })[],
  discipline: Disc,
  ctx: ProfileContext = {},
): Profile {
  const segments: ProfileSegment[] = [];
  let derived = false;

  const pushRest = (
    key: string,
    source: Parameters<typeof restMinutes>[0],
    workMin: number | null,
  ) => {
    const min = restMinutes(source, workMin);
    // A rest with nothing recorded at all is not drawn; one that exists but
    // whose length we cannot resolve still is, because it happened.
    if (min == null && source.rest_mode == null && source.rest_seconds == null)
      return;
    segments.push({
      key,
      kind: "rest",
      label: "rest",
      durationMin: min,
      distanceKm: null,
      durationFrom: min == null ? null : "prescribed",
      distanceFrom: null,
      zone: 1,
      blockType: "rest",
    });
  };

  for (const b of blocks) {
    const label = b.label || b.block_type;

    if (blockHasRounds(b.block_type)) {
      const mine = rounds.filter((r) => r.workout_block_id === b.id);

      if (mine.length) {
        mine.forEach((r, i) => {
          const work = roundMinutes(r, b.zone, discipline, ctx);
          if (work && work.from !== "prescribed") derived = true;
          segments.push({
            key: `${b.id}:r${i}`,
            kind: "work",
            label: `${label} ${i + 1}`,
            durationMin: work?.min ?? null,
            distanceKm: roundDistanceKm(r),
            durationFrom: work?.from ?? null,
            distanceFrom: roundDistanceKm(r) == null ? null : "prescribed",
            zone: r.hr_zone ?? b.zone ?? null,
            blockType: b.block_type,
          });
          // No rest after the last one: the session ends with the work.
          if (i < mine.length - 1)
            pushRest(`${b.id}:rest${i}`, r, work?.min ?? null);
        });
        continue;
      }

      // An interval block can carry only a count, with no round rows at all
      // — that is how the plain builder writes them. Six intervals should
      // still look like six intervals even when we cannot size them.
      const n = b.interval_count ?? 0;
      if (n > 0) {
        for (let i = 0; i < n; i++) {
          segments.push({
            key: `${b.id}:n${i}`,
            kind: "work",
            label: `${label} ${i + 1}`,
            durationMin: null,
            distanceKm: null,
            durationFrom: null,
            distanceFrom: null,
            zone: b.zone ?? null,
            blockType: b.block_type,
          });
          if (i < n - 1) pushRest(`${b.id}:nrest${i}`, b, null);
        }
        continue;
      }

      // Nothing to go on but the block itself.
      segments.push({
        key: b.id,
        kind: "work",
        label,
        durationMin: null,
        distanceKm: null,
        durationFrom: null,
        distanceFrom: null,
        zone: b.zone ?? null,
        blockType: b.block_type,
      });
      continue;
    }

    const res = blockMinutes(b, discipline, ctx);
    const min = res?.min ?? null;
    if (res && res.from !== "prescribed") derived = true;
    // A session given in time still has a distance worth showing, once
    // the zone and a threshold say how fast that time will be covered.
    const estDistance =
      b.distance_km == null && min != null
        ? distanceFromMinutes(min, b.zone, discipline, ctx)
        : null;
    segments.push({
      key: b.id,
      kind: "work",
      label,
      durationMin: min,
      durationFrom: res?.from ?? null,
      distanceKm:
        b.distance_km != null
          ? Number(b.distance_km)
          : (estDistance?.km ?? null),
      distanceFrom:
        b.distance_km != null ? "prescribed" : (estDistance?.from ?? null),
      zone: b.zone ?? null,
      blockType: b.block_type,
    });
  }

  const work = segments.filter((s) => s.kind === "work");

  // A total is only shown when every piece of work contributes to it. A
  // part-total is worse than none: it reads as the session's length while
  // silently leaving blocks out.
  const totalMin = segments.every((s) => s.durationMin != null)
    ? segments.reduce((a, s) => a + (s.durationMin ?? 0), 0)
    : null;
  const totalKm = work.every((s) => s.distanceKm != null)
    ? work.reduce((a, s) => a + (s.distanceKm ?? 0), 0)
    : null;
  const minEstimated = segments.some(
    (s) => s.durationFrom != null && s.durationFrom !== "prescribed",
  );
  const kmEstimated = work.some(
    (s) => s.distanceFrom != null && s.distanceFrom !== "prescribed",
  );
  const estimatedFrom = Array.from(
    new Set(
      [
        ...segments.map((s) => s.durationFrom),
        ...work.map((s) => s.distanceFrom),
      ].filter(
        (p): p is "pace" | "zone" | "speed" =>
          p === "pace" || p === "zone" || p === "speed",
      ),
    ),
  );

  const zones = work.map((s) => s.zone).filter((z): z is number => z != null);
  const hardestZone = zones.length ? Math.max(...zones) : null;
  const totals = {
    totalMin,
    totalKm,
    hardestZone,
    minEstimated,
    kmEstimated,
    estimatedFrom,
  };
  const allMinutes =
    work.length > 0 && work.every((s) => s.durationMin != null);
  const allDistance =
    work.length > 0 && work.every((s) => s.distanceKm != null);

  if (allMinutes) {
    const total = segments.reduce((a, s) => a + (s.durationMin ?? 0), 0);
    return { segments, axis: "min", total, derived, ...totals };
  }
  if (allDistance) {
    const total = work.reduce((a, s) => a + (s.distanceKm ?? 0), 0);
    return { segments, axis: "km", total, derived, ...totals };
  }
  return { segments, axis: null, total: 0, derived, ...totals };
}

/**
 * Axis ticks at a readable spacing. Never more than seven labels, however
 * long the session: a crowded axis is harder to read than a sparse one.
 */
export function profileTicks(total: number, axis: ProfileAxis): number[] {
  if (!axis || total <= 0) return [];
  const steps =
    axis === "min" ? [5, 10, 15, 20, 30, 60] : [0.5, 1, 2, 5, 10, 20, 50];
  const step = steps.find((s) => total / s <= 6) ?? steps[steps.length - 1];
  const ticks: number[] = [];
  for (let t = 0; t <= total + 1e-9; t += step)
    ticks.push(Math.round(t * 10) / 10);
  return ticks;
}

/**
 * How much of the axis a segment takes. In structure mode every piece of
 * work is equal and rests are visibly shorter, so the drawing shows the
 * session's shape without claiming to show its scale.
 */
export function segmentWeight(s: ProfileSegment, axis: ProfileAxis): number {
  if (axis === "min") return Math.max(s.durationMin ?? 0.2, 0.2);
  if (axis === "km")
    return s.kind === "rest" ? 0.15 : Math.max(s.distanceKm ?? 0.1, 0.1);
  return s.kind === "rest" ? 0.4 : 1;
}

/** Zone 1 low, zone 5 full; unknown sits mid rather than pretending easy. */
export function zoneHeight(zone: number | null, kind: ProfileKind): number {
  if (kind === "rest") return 0.18;
  if (zone == null) return 0.55;
  const z = Math.min(5, Math.max(1, zone));
  return 0.3 + (z - 1) * 0.175;
}
