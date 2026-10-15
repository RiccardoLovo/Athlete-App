// Admin-only bulk export/import for the exercise catalog. Plain CSV so it
// round-trips through Excel/Sheets: export, edit offline, re-import. Rows
// with an `id` column update that existing exercise; rows without one
// insert a new exercise.

export const CSV_COLUMNS = [
  "id",
  "name_en",
  "name_it",
  "discipline",
  "category",
  "body_region",
  "muscle_group",
  "stroke_default",
  "sport_tag",
  "structure_type",
  "template_type",
  "is_global",
  "video_url",
  "description_en",
  "description_it",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export interface ExerciseCsvRow {
  id: string;
  name_en: string;
  name_it: string;
  discipline: string;
  category: string;
  body_region: string | null;
  muscle_group: string | null;
  stroke_default: string | null;
  sport_tag: string | null;
  structure_type: string;
  template_type: string | null;
  is_global: boolean;
  video_url: string | null;
  description_en: string | null;
  description_it: string | null;
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exercisesToCsv(rows: ExerciseCsvRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      CSV_COLUMNS.map((c) =>
        csvEscape(c === "is_global" ? (r.is_global ? "true" : "false") : r[c]),
      ).join(","),
    );
  }
  // Leading BOM so Excel opens UTF-8 (accented names) correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// Minimal RFC4180 parser: handles quoted fields with embedded commas,
// newlines, and doubled quotes. No external dependency needed for this.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const REQUIRED = ["name_en", "name_it", "discipline", "category"] as const;
const VALID_DISCIPLINES = new Set([
  "Strength",
  "Running",
  "Swimming",
  "Cycling",
  "Football",
  "Padel",
  "Mobility",
]);
const VALID_CATEGORIES = new Set([
  "Resistance",
  "Cardio",
  "Mobility",
  "Plyometric",
  "Activation",
]);
const VALID_STRUCTURE_TYPES = new Set(["simple", "intervals", "template"]);

export interface ParsedExerciseImport {
  rows: Array<Record<string, unknown>>;
  errors: string[];
}

// Parses CSV text (as produced by exercisesToCsv, or hand-edited) into
// upsert-ready row objects, skipping and reporting anything invalid rather
// than failing the whole import over one bad line.
export function parseExerciseImport(text: string): ParsedExerciseImport {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (!table.length) return { rows: [], errors: ["Empty file"] };
  const header = table[0].map((h) => h.trim());
  const idx = new Map(header.map((h, i) => [h, i]));
  for (const col of REQUIRED) {
    if (!idx.has(col)) errors.push(`Missing required column "${col}"`);
  }
  if (errors.length) return { rows: [], errors };

  const rows: Array<Record<string, unknown>> = [];
  for (let r = 1; r < table.length; r++) {
    const raw = table[r];
    const lineNo = r + 1;
    const get = (col: CsvColumn): string =>
      (idx.has(col) ? raw[idx.get(col)!] : "")?.trim() ?? "";

    const name_en = get("name_en");
    const name_it = get("name_it");
    const discipline = get("discipline");
    const category = get("category");
    if (!name_en && !name_it && !discipline && !category) continue; // blank line

    const rowErrors: string[] = [];
    if (!name_en) rowErrors.push("missing name_en");
    if (!name_it) rowErrors.push("missing name_it");
    if (!VALID_DISCIPLINES.has(discipline))
      rowErrors.push(`invalid discipline "${discipline}"`);
    if (!VALID_CATEGORIES.has(category))
      rowErrors.push(`invalid category "${category}"`);
    const structureType = get("structure_type") || "simple";
    if (!VALID_STRUCTURE_TYPES.has(structureType))
      rowErrors.push(`invalid structure_type "${structureType}"`);

    if (rowErrors.length) {
      errors.push(`Row ${lineNo}: ${rowErrors.join(", ")} — skipped`);
      continue;
    }

    const isGlobalRaw = get("is_global").toLowerCase();
    const id = get("id");
    const row: Record<string, unknown> = {
      name_en,
      name_it,
      discipline,
      category,
      body_region: get("body_region") || null,
      muscle_group: get("muscle_group") || null,
      stroke_default: get("stroke_default") || null,
      sport_tag: get("sport_tag") || null,
      structure_type: structureType,
      template_type: get("template_type") || null,
      is_global: isGlobalRaw
        ? ["true", "1", "yes"].includes(isGlobalRaw)
        : true,
      video_url: get("video_url") || null,
      description_en: get("description_en") || null,
      description_it: get("description_it") || null,
    };
    if (id) row.id = id;
    rows.push(row);
  }
  return { rows, errors };
}
