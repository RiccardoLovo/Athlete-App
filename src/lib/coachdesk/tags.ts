export const TRAINING_CATEGORIES = [
  {
    key: "forza",
    label: "Strength",
    className:
      "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
  },
  {
    key: "potenza",
    label: "Power",
    className:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  },
  {
    key: "aerobica",
    label: "Aerobic Capacity",
    className:
      "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  },
  {
    key: "anaerobica",
    label: "Anaerobic",
    className:
      "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
  },
  {
    key: "rsa",
    label: "RSA",
    className:
      "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
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
  "bg-slate-900 text-slate-50 border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100";

export function trainingCategoryMeta(key: string) {
  return TRAINING_CATEGORIES.find((t) => t.key === key);
}

export function bodyRegionLabel(key: string | null | undefined) {
  if (!key) return null;
  return BODY_REGIONS.find((r) => r.key === key)?.label ?? null;
}
