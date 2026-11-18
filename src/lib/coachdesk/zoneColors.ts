// The zone ramp, written out in full so Tailwind sees each class literally.
// Shared by everything that shows a zone — the session profile's bars and
// the targets in the block rows — so a Z4 is the same colour wherever it
// appears.

export const ZONE_BG: Record<number, string> = {
  1: "bg-zone-1",
  2: "bg-zone-2",
  3: "bg-zone-3",
  4: "bg-zone-4",
  5: "bg-zone-5",
};

export const ZONE_TEXT: Record<number, string> = {
  1: "text-zone-1",
  2: "text-zone-2",
  3: "text-zone-3",
  4: "text-zone-4",
  5: "text-zone-5",
};

export const ZONE_BORDER: Record<number, string> = {
  1: "border-zone-1",
  2: "border-zone-2",
  3: "border-zone-3",
  4: "border-zone-4",
  5: "border-zone-5",
};

function clamp(zone: number) {
  return Math.min(5, Math.max(1, Math.round(zone)));
}

export function zoneBg(zone: number | null | undefined, fallback = "bg-muted") {
  return zone == null ? fallback : ZONE_BG[clamp(zone)];
}

export function zoneText(
  zone: number | null | undefined,
  fallback = "text-foreground",
) {
  return zone == null ? fallback : ZONE_TEXT[clamp(zone)];
}

export function zoneBorder(
  zone: number | null | undefined,
  fallback = "border-border",
) {
  return zone == null ? fallback : ZONE_BORDER[clamp(zone)];
}
