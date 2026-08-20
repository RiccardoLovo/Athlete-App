// Date helpers for the Plan → Block → Week → Day hierarchy.
// All dates use local time; week starts on Monday (1 = Monday … 7 = Sunday).

export const DAYS_OF_WEEK = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;
export const DAYS_OF_WEEK_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Returns the next Monday on or after today (today if today is Monday).
export function nextMonday(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  const offset = day === 1 ? 0 : (1 - day + 7) % 7;
  return addDays(d, offset);
}

export type BlockLike = { weeks: number; position: number };

// First day of a given block (1-indexed position) inside the plan.
export function blockStart(
  planStart: string,
  blocks: BlockLike[],
  blockPosition: number,
): Date {
  const sorted = [...blocks].sort((a, b) => a.position - b.position);
  let offset = 0;
  for (const b of sorted) {
    if (b.position >= blockPosition) break;
    offset += b.weeks * 7;
  }
  return addDays(parseISODate(planStart), offset);
}

export function blockEnd(
  planStart: string,
  blocks: BlockLike[],
  blockPosition: number,
): Date {
  const start = blockStart(planStart, blocks, blockPosition);
  const b = blocks.find((x) => x.position === blockPosition);
  const weeks = b?.weeks ?? 0;
  return addDays(start, weeks * 7 - 1);
}

export function planEnd(planStart: string, blocks: BlockLike[]): Date {
  const total = blocks.reduce((s, b) => s + b.weeks, 0);
  if (total === 0) return parseISODate(planStart);
  return addDays(parseISODate(planStart), total * 7 - 1);
}

export function weekRange(
  blockStartDate: Date,
  weekIndex: number,
): { start: Date; end: Date } {
  const start = addDays(blockStartDate, (weekIndex - 1) * 7);
  const end = addDays(start, 6);
  return { start, end };
}

const SHORT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const LONG = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatShort(d: Date): string {
  return SHORT.format(d);
}
export function formatLong(d: Date): string {
  return LONG.format(d);
}

export function formatRange(a: Date, b: Date): string {
  if (a.getFullYear() === b.getFullYear())
    return `${SHORT.format(a)} – ${SHORT.format(b)}`;
  return `${LONG.format(a)} – ${LONG.format(b)}`;
}

export function isToday(d: Date): boolean {
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

export function isBetween(d: Date, start: Date, end: Date): boolean {
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

// What week index (1-based) of the block contains the given date, or null if out of range.
export function weekIndexForDate(
  blockStartDate: Date,
  totalWeeks: number,
  d: Date,
): number | null {
  const start = new Date(blockStartDate);
  start.setHours(0, 0, 0, 0);
  const end = addDays(start, totalWeeks * 7 - 1);
  if (d < start || d > end) return null;
  const diff = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  return Math.floor(diff / 7) + 1;
}

// Locate which block/week/day-of-week a calendar date falls into, for
// logging an extra session against an absolute date rather than a
// currently-viewed week. Returns null if the date falls outside every block.
export function resolveDateToBlockWeekDay(
  planStart: string,
  blocks: BlockLike[],
  d: Date,
): { blockPosition: number; weekInBlock: number; dayOfWeek: number } | null {
  const sorted = [...blocks].sort((a, b) => a.position - b.position);
  for (const b of sorted) {
    const start = blockStart(planStart, sorted, b.position);
    const weekInBlock = weekIndexForDate(start, b.weeks, d);
    if (weekInBlock == null) continue;
    const dayOfWeek = ((d.getDay() + 6) % 7) + 1; // 1=Mon .. 7=Sun
    return { blockPosition: b.position, weekInBlock, dayOfWeek };
  }
  return null;
}
