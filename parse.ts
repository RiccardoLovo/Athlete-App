import { DAY_LABELS } from "./constants";

const DAY_RE = /^(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|sunday|sun)\b/i;
const DAY_MAP: Record<string, number> = {
  mon: 0, monday: 0,
  tue: 1, tues: 1, tuesday: 1,
  wed: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3,
  fri: 4, friday: 4,
  sat: 5, saturday: 5,
  sun: 6, sunday: 6,
};

export interface ParsedExercise {
  name: string;
  sets: string;
  reps: string;
  weight: string;
  rest: string;
  tempo: string;
  notes: string;
}

export interface ParsedDay {
  day_number: number;
  day_label: string;
  slot: number;
  exercises: ParsedExercise[];
}

export function parseTextPlan(text: string): ParsedDay[] {
  const lines = text.split("\n").map((l) => l.trim());
  const days: ParsedDay[] = [];
  let current: ParsedDay | null = null;

  for (const line of lines) {
    if (!line) continue;
    const m = line.match(DAY_RE);
    if (m) {
      const dayName = m[1].toLowerCase();
      const dayNum = DAY_MAP[dayName];
      const rest = line.slice(m[0].length).toLowerCase();
      let slot = 1;
      if (/\b(pm|afternoon|evening|session\s*2|workout\s*2)\b/.test(rest)) slot = 2;
      current = {
        day_number: dayNum,
        day_label: DAY_LABELS[dayNum],
        slot,
        exercises: [],
      };
      days.push(current);
      continue;
    }
    if (!current) continue;

    let s = line.replace(/^\s*(\d+[.)]|[-•*])\s*/, "");
    if (!s) continue;

    // Extract notes from parentheses
    let notes = "";
    s = s.replace(/\(([^)]+)\)/g, (_, t) => { notes = notes ? `${notes}; ${t}` : t; return ""; }).trim();

    // Tempo: 3-1-2-0 or "tempo: 3010"
    let tempo = "";
    const tempoColon = s.match(/tempo\s*[:=]\s*([\d-]+)/i);
    if (tempoColon) { tempo = tempoColon[1]; s = s.replace(tempoColon[0], "").trim(); }
    const tempoDash = s.match(/\b(\d-\d-\d-\d)\b/);
    if (!tempo && tempoDash) { tempo = tempoDash[1]; s = s.replace(tempoDash[0], "").trim(); }

    // Rest: "90s rest", "rest 90s", "2min rest", "rest 2min"
    let rest = "";
    const restMatch = s.match(/(?:rest\s+)?(\d+\s*(?:s|sec|secs|seconds|min|mins|minutes))\s*(?:rest)?/i);
    if (restMatch && /rest/i.test(restMatch[0])) {
      rest = restMatch[1].replace(/\s+/g, "");
      s = s.replace(restMatch[0], "").trim();
    }

    // Weight: 80kg, @80kg, 80 lbs
    let weight = "";
    const wMatch = s.match(/@?\s*(\d+(?:\.\d+)?)\s*(kg|lbs|lb|%)\b/i);
    if (wMatch) { weight = `${wMatch[1]}${wMatch[2].toLowerCase()}`; s = s.replace(wMatch[0], "").trim(); }

    // Sets x Reps
    let sets = "", reps = "";
    const srMatch = s.match(/(\d+)\s*(?:x|×|\s+sets?\s+(?:x|of)\s*)\s*(\d+\s*(?:s|sec|secs|seconds|min|m)?)\s*(?:reps?)?/i);
    if (srMatch) {
      sets = srMatch[1];
      reps = srMatch[2].replace(/\s+/g, "");
      s = s.replace(srMatch[0], "").trim();
    }

    const name = s.replace(/\s+/g, " ").replace(/[,:;]+$/, "").trim();
    if (!name) continue;

    current.exercises.push({ name, sets, reps, weight, rest, tempo, notes });
  }
  return days;
}

export type MatchConfidence = "high" | "medium" | "low";

export interface MatchResult {
  exerciseId: string | null;
  matchedName: string | null;
  confidence: MatchConfidence;
}

export function fuzzyMatchExercise(
  name: string,
  library: Array<{ id: string; name_en: string }>,
): MatchResult {
  const n = name.toLowerCase().trim();
  const exact = library.find((e) => e.name_en.toLowerCase() === n);
  if (exact) return { exerciseId: exact.id, matchedName: exact.name_en, confidence: "high" };

  const contains = library.filter((e) =>
    e.name_en.toLowerCase().includes(n) || n.includes(e.name_en.toLowerCase()),
  );
  if (contains.length === 1) {
    return { exerciseId: contains[0].id, matchedName: contains[0].name_en, confidence: "high" };
  }

  const words = new Set(n.split(/\s+/).filter((w) => w.length > 2));
  let best: { id: string; name_en: string; score: number } | null = null;
  for (const e of library) {
    const ew = new Set(e.name_en.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
    if (!words.size || !ew.size) continue;
    let common = 0;
    for (const w of words) if (ew.has(w)) common++;
    const score = common / Math.max(words.size, ew.size);
    if (score >= 0.5 && (!best || score > best.score)) {
      best = { id: e.id, name_en: e.name_en, score };
    }
  }
  if (best) return { exerciseId: best.id, matchedName: best.name_en, confidence: "medium" };
  return { exerciseId: null, matchedName: null, confidence: "low" };
}

// Simple parser for client portal free-text feedback
export interface ParsedFeedback {
  borg?: number;
  exercises: Array<{ name: string; weight?: string; reps?: string; notes?: string }>;
}

export function parseFeedbackText(text: string): ParsedFeedback {
  const result: ParsedFeedback = { exercises: [] };
  const borgMatch = text.match(/borg\s*[:=]?\s*(\d{1,2})/i);
  if (borgMatch) {
    const v = parseInt(borgMatch[1], 10);
    if (v >= 1 && v <= 10) result.borg = v;
  }
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^borg/i.test(line)) continue;
    let notes = "";
    let s = line.replace(/\(([^)]+)\)/g, (_, t) => { notes = t; return ""; }).trim();
    const wMatch = s.match(/(\d+(?:\.\d+)?)\s*(kg|lbs|lb)\b/i);
    const weight = wMatch ? `${wMatch[1]}${wMatch[2].toLowerCase()}` : undefined;
    if (wMatch) s = s.replace(wMatch[0], "").trim();
    const rMatch = s.match(/(\d+)\s*(?:reps?|x)\b/i);
    const reps = rMatch ? rMatch[1] : undefined;
    if (rMatch) s = s.replace(rMatch[0], "").trim();
    const name = s.replace(/[,:;-]+$/, "").trim();
    if (name) result.exercises.push({ name, weight, reps, notes: notes || undefined });
  }
  return result;
}