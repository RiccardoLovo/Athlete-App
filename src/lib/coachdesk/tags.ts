// Monochrome: every training-category tag shares the same neutral
// treatment now — the label carries the meaning, not the color.
const NEUTRAL_TAG = "bg-secondary text-secondary-foreground border-border";

export const TRAINING_CATEGORIES = [
  {
    key: "forza",
    label: "Strength",
    className: NEUTRAL_TAG,
  },
  {
    key: "potenza",
    label: "Power",
    className: NEUTRAL_TAG,
  },
  {
    key: "aerobica",
    label: "Aerobic Capacity",
    className: NEUTRAL_TAG,
  },
  {
    key: "anaerobica",
    label: "Anaerobic",
    className: NEUTRAL_TAG,
  },
  {
    key: "rsa",
    label: "RSA",
    className: NEUTRAL_TAG,
  },
] as const;

export type TrainingCategoryKey = (typeof TRAINING_CATEGORIES)[number]["key"];

export const BODY_REGIONS = [
  { key: "upper", label: "Upper Body" },
  { key: "lower", label: "Lower Body" },
  { key: "full", label: "Full Body" },
] as const;

export type BodyRegionKey = (typeof BODY_REGIONS)[number]["key"];

export const BODY_REGION_BADGE =
  "bg-foreground text-background border-foreground";

export function trainingCategoryMeta(key: string) {
  return TRAINING_CATEGORIES.find((t) => t.key === key);
}

export function bodyRegionLabel(key: string | null | undefined) {
  if (!key) return null;
  return BODY_REGIONS.find((r) => r.key === key)?.label ?? null;
}
