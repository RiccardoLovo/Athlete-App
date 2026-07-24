import jsPDF from "jspdf";
import { DAY_LABELS } from "./constants";
import type { Discipline } from "./prescription";

// ─────────────────────────────────────────────────────────────────────
// CoachDesk training PDF — dark "charcoal grid" design.
// Landscape A4. Single-column day rails, multiple sessions per day,
// structured strength columns, single-line endurance summary.
// ─────────────────────────────────────────────────────────────────────

export interface PdfExercise {
  name: string;
  discipline: Discipline;
  order_index: number;
  // Resolved strength fields (load_kg is already converted from %1RM if needed).
  sets: number | null;
  reps: string;
  load_label: string;     // "140kg" | "82% (115kg)" | "BW" | ""
  rest_sec: number | null;
  tempo: string;
  rpe: number | null;
  notes: string;
  // Used for non-strength disciplines.
  summary: string;
  // Optional interval rows (intervals/template structure types).
  intervals?: PdfInterval[];
  structure_type?: "simple" | "intervals" | "template";
}

export interface PdfInterval {
  label: string | null;
  target_value: number | null;
  target_unit: "meters" | "seconds" | "minutes";
  pace_per_km: string | null;
  hr_zone: number | null;
  watts: number | null;
  cadence: number | null;
  stroke: string | null;
  intensity: string | null;
  rest_seconds: number | null;
  rest_type: "passive" | "active" | null;
}

export interface PdfSession {
  name: string | null;        // e.g. "AM Strength", null if unnamed
  exercises: PdfExercise[];
}

export interface PdfDay {
  day_number: number;         // 0=Mon..6=Sun
  sessions: PdfSession[];
}

export interface PdfWeek {
  weekNumber: number;
  days: PdfDay[];
}

export type TrainingPdfScope = "day" | "week" | "block";

// RGB color palette (dark / charcoal grid).
const C = {
  bg:        [10, 10, 12]   as [number, number, number],
  headerBg:  [18, 18, 21]   as [number, number, number],
  card:      [22, 22, 26]   as [number, number, number],
  cardSoft:  [18, 18, 22]   as [number, number, number],
  cellBg:    [14, 14, 17]   as [number, number, number],
  border:    [40, 40, 46]   as [number, number, number],
  borderLo:  [30, 30, 34]   as [number, number, number],
  text100:   [244, 244, 245] as [number, number, number],
  text200:   [220, 220, 224] as [number, number, number],
  text400:   [161, 161, 170] as [number, number, number],
  text500:   [113, 113, 122] as [number, number, number],
  text600:   [82, 82, 91]    as [number, number, number],
  accent:    [70, 120, 90]   as [number, number, number],
};

function setFill(doc: jsPDF, c: [number, number, number]) { doc.setFillColor(c[0], c[1], c[2]); }
function setText(doc: jsPDF, c: [number, number, number]) { doc.setTextColor(c[0], c[1], c[2]); }
function setDraw(doc: jsPDF, c: [number, number, number]) { doc.setDrawColor(c[0], c[1], c[2]); }

export function exportTrainingPdf(opts: {
  scope: TrainingPdfScope;
  clientName: string;
  sport: string;
  blockName?: string;
  weeks: PdfWeek[];
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();   // ~842
  const H = doc.internal.pageSize.getHeight();  // ~595
  const M = 36;                                  // page margin
  const HEADER_H = 56;
  const FOOTER_H = 28;

  const scopeLabel =
    opts.scope === "day" ? "Daily Plan"
    : opts.scope === "week" ? "Weekly Plan"
    : "Block Plan";

  const orderedWeeks = [...opts.weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  let currentSubtitle = scopeLabel;

  const paintBackground = () => {
    setFill(doc, C.bg);
    doc.rect(0, 0, W, H, "F");
  };

  const drawHeader = (subtitle: string) => {
    setFill(doc, C.headerBg);
    doc.rect(0, 0, W, HEADER_H, "F");
    setDraw(doc, C.border);
    doc.setLineWidth(0.5);
    doc.line(0, HEADER_H, W, HEADER_H);

    setText(doc, C.text500);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("TRAINING EXPORT", M, 20);

    setText(doc, C.text100);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    const title = opts.clientName.toUpperCase();
    doc.text(title, M, 40);

    // right side
    const meta = [opts.sport, opts.blockName].filter(Boolean).join(" · ");
    setText(doc, C.text500);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    if (meta) doc.text(meta.toUpperCase(), W - M, 20, { align: "right" });

    setText(doc, C.accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(subtitle.toUpperCase(), W - M, 40, { align: "right" });
  };

  const drawFooter = (pageNum: number, pageTotal: number) => {
    setDraw(doc, C.borderLo);
    doc.setLineWidth(0.5);
    doc.line(M, H - FOOTER_H + 8, W - M, H - FOOTER_H + 8);
    setText(doc, C.text600);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("COACHDESK · PERFORMANCE EXPORT", M, H - 12);
    doc.setFont("helvetica", "normal");
    doc.text(`PAGE ${String(pageNum).padStart(2, "0")} / ${String(pageTotal).padStart(2, "0")}`, W - M, H - 12, { align: "right" });
  };

  let cursorY = 0;
  const contentTop = HEADER_H + 20;
  const contentBottom = H - FOOTER_H - 8;

  const newPage = (subtitle: string) => {
    if (cursorY !== 0) doc.addPage();
    paintBackground();
    drawHeader(subtitle);
    cursorY = contentTop;
    currentSubtitle = subtitle;
  };

  const ensureSpace = (needed: number) => {
    if (cursorY + needed > contentBottom) newPage(currentSubtitle);
  };

  // ── Drawing primitives ────────────────────────────────────────────

  const drawDayHeader = (dayNumber: number) => {
    ensureSpace(28);
    const label = DAY_LABELS[dayNumber] ?? `Day ${dayNumber + 1}`;
    // accent rail
    setFill(doc, C.accent);
    doc.rect(M, cursorY + 2, 3, 20, "F");
    setText(doc, C.text100);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(label.slice(0, 3).toUpperCase(), M + 12, cursorY + 18);
    setText(doc, C.text500);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(label.toUpperCase(), M + 56, cursorY + 18);
    cursorY += 30;
  };

  const drawSessionHeader = (sessionIdx: number, totalSessions: number, name: string | null, mix: string) => {
    ensureSpace(20);
    const tag = totalSessions > 1
      ? `SESSION ${String(sessionIdx + 1).padStart(2, "0")} / ${(name ?? mix).toUpperCase()}`
      : (name ? `${name.toUpperCase()} / ${mix.toUpperCase()}` : mix.toUpperCase());
    setText(doc, C.accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(tag, M + 4, cursorY + 10);
    setDraw(doc, C.borderLo);
    doc.setLineWidth(0.5);
    const tagWidth = doc.getTextWidth(tag);
    doc.line(M + 4 + tagWidth + 8, cursorY + 8, W - M, cursorY + 8);
    cursorY += 18;
  };

  const drawStrengthExercise = (e: PdfExercise, isLast: boolean) => {
    // Heights: name row (16) + grid row (28) + notes (variable) + spacing
    const innerLeft = M + 4;
    const innerRight = W - M - 4;
    const innerW = innerRight - innerLeft;
    const notesLines = e.notes
      ? doc.splitTextToSize(`Notes: ${e.notes}`, innerW)
      : [];
    const notesH = notesLines.length ? notesLines.length * 9 + 6 : 0;
    const blockH = 16 + 30 + notesH + (isLast ? 4 : 10);
    ensureSpace(blockH);

    // Name row
    setText(doc, C.text200);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(e.name, innerLeft, cursorY + 11);
    if (e.rpe != null) {
      setText(doc, C.text400);
      doc.setFont("courier", "normal");
      doc.setFontSize(9);
      doc.text(`RPE ${e.rpe}`, innerRight, cursorY + 11, { align: "right" });
    }
    cursorY += 16;

    // 5-column grid
    const cols: Array<{ label: string; value: string }> = [
      { label: "SETS",  value: e.sets != null ? String(e.sets) : "—" },
      { label: "REPS",  value: e.reps || "—" },
      { label: "LOAD",  value: e.load_label || "—" },
      { label: "REST",  value: e.rest_sec != null ? `${e.rest_sec}s` : "—" },
      { label: "TEMPO", value: e.tempo || "—" },
    ];
    const gridH = 28;
    const colW = innerW / cols.length;
    // outer border
    setFill(doc, C.cellBg);
    doc.rect(innerLeft, cursorY, innerW, gridH, "F");
    setDraw(doc, C.border);
    doc.setLineWidth(0.5);
    doc.rect(innerLeft, cursorY, innerW, gridH);
    for (let i = 0; i < cols.length; i++) {
      const cx = innerLeft + i * colW;
      if (i > 0) {
        doc.line(cx, cursorY, cx, cursorY + gridH);
      }
      setText(doc, C.text500);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.text(cols[i].label, cx + colW / 2, cursorY + 9, { align: "center" });
      setText(doc, C.text100);
      doc.setFont("courier", "normal");
      doc.setFontSize(10);
      doc.text(cols[i].value, cx + colW / 2, cursorY + 22, { align: "center" });
    }
    cursorY += gridH + 4;

    // Notes
    if (notesLines.length) {
      setText(doc, C.text500);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(notesLines, innerLeft, cursorY + 6);
      cursorY += notesH;
    }

    // Divider between exercises within the same session
    if (!isLast) {
      cursorY += 4;
      setDraw(doc, C.borderLo);
      doc.setLineWidth(0.5);
      doc.line(innerLeft, cursorY, innerRight, cursorY);
      cursorY += 6;
    } else {
      cursorY += 4;
    }
  };

  const drawEnduranceExercise = (e: PdfExercise, isLast: boolean) => {
    const innerLeft = M + 4;
    const innerRight = W - M - 4;
    const innerW = innerRight - innerLeft;
    const summaryLines = e.summary
      ? doc.splitTextToSize(e.summary, innerW - 180)
      : ["—"];
    const notesLines = e.notes
      ? doc.splitTextToSize(`Notes: ${e.notes}`, innerW)
      : [];
    const blockH = 20 + summaryLines.length * 10 + (notesLines.length ? notesLines.length * 9 + 6 : 0) + (isLast ? 4 : 10);
    ensureSpace(blockH);

    setText(doc, C.text200);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(e.name, innerLeft, cursorY + 11);
    // discipline pill on the right
    setText(doc, C.accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(e.discipline.toUpperCase(), innerRight, cursorY + 11, { align: "right" });
    cursorY += 16;

    setText(doc, C.text400);
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    doc.text(summaryLines, innerLeft, cursorY + 8);
    cursorY += summaryLines.length * 10 + 2;

    if (notesLines.length) {
      setText(doc, C.text500);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(notesLines, innerLeft, cursorY + 6);
      cursorY += notesH(notesLines);
    }

    if (!isLast) {
      cursorY += 4;
      setDraw(doc, C.borderLo);
      doc.setLineWidth(0.5);
      doc.line(innerLeft, cursorY, innerRight, cursorY);
      cursorY += 6;
    } else {
      cursorY += 4;
    }
  };

  function notesH(lines: string[]) { return lines.length * 9 + 6; }

  const drawIntervalsExercise = (e: PdfExercise, isLast: boolean) => {
    const innerLeft = M + 4;
    const innerRight = W - M - 4;
    const innerW = innerRight - innerLeft;
    const rows = e.intervals ?? [];
    const headerH = 16;
    const tableHeaderH = 14;
    const rowH = 14;
    const notesLines = e.notes ? doc.splitTextToSize(`Notes: ${e.notes}`, innerW) : [];
    const notesHpx = notesLines.length ? notesLines.length * 9 + 6 : 0;
    const blockH = headerH + tableHeaderH + rowH * Math.max(rows.length, 1) + notesHpx + (isLast ? 4 : 10);
    ensureSpace(blockH);

    // Name row
    setText(doc, C.text200);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(e.name, innerLeft, cursorY + 11);
    setText(doc, C.accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(`${e.discipline.toUpperCase()} · INTERVALS`, innerRight, cursorY + 11, { align: "right" });
    cursorY += headerH;

    // Table header
    const cols = [
      { key: "n",      label: "#",      w: 18, align: "center" as const },
      { key: "label",  label: "LABEL",  w: 90, align: "left" as const },
      { key: "target", label: "TARGET", w: 80, align: "left" as const },
      { key: "spec",   label: "PACE / W / Z / STROKE", w: 0, align: "left" as const }, // flex
      { key: "rest",   label: "REST",   w: 70, align: "left" as const },
    ];
    const fixed = cols.reduce((s, c) => s + c.w, 0);
    const flexW = innerW - fixed;
    const colWidths = cols.map((c) => (c.w === 0 ? flexW : c.w));

    setFill(doc, C.headerBg);
    doc.rect(innerLeft, cursorY, innerW, tableHeaderH, "F");
    setDraw(doc, C.border);
    doc.setLineWidth(0.5);
    doc.rect(innerLeft, cursorY, innerW, tableHeaderH);
    setText(doc, C.text500);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    let cx = innerLeft;
    for (let i = 0; i < cols.length; i++) {
      const w = colWidths[i];
      if (i > 0) doc.line(cx, cursorY, cx, cursorY + tableHeaderH);
      const tx = cols[i].align === "center" ? cx + w / 2 : cx + 4;
      doc.text(cols[i].label, tx, cursorY + 9, { align: cols[i].align });
      cx += w;
    }
    cursorY += tableHeaderH;

    if (!rows.length) {
      setFill(doc, C.cellBg);
      doc.rect(innerLeft, cursorY, innerW, rowH, "F");
      doc.rect(innerLeft, cursorY, innerW, rowH);
      setText(doc, C.text500);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.text("No intervals configured", innerLeft + 6, cursorY + 9);
      cursorY += rowH;
    } else {
      rows.forEach((r, i) => {
        setFill(doc, i % 2 === 0 ? C.cellBg : C.cardSoft);
        doc.rect(innerLeft, cursorY, innerW, rowH, "F");
        setDraw(doc, C.borderLo);
        doc.rect(innerLeft, cursorY, innerW, rowH);
        setText(doc, C.text200);
        doc.setFont("courier", "normal");
        doc.setFontSize(8);
        const target = r.target_value != null ? `${r.target_value}${unitShort(r.target_unit)}` : "—";
        const specParts: string[] = [];
        if (r.pace_per_km) specParts.push(r.pace_per_km);
        if (r.watts != null) specParts.push(`${r.watts}W`);
        if (r.hr_zone != null) specParts.push(`Z${r.hr_zone}`);
        if (r.cadence != null) specParts.push(`${r.cadence}rpm`);
        if (r.stroke) specParts.push(r.stroke);
        if (r.intensity) specParts.push(r.intensity);
        const rest = r.rest_seconds != null ? `${r.rest_seconds}s${r.rest_type === "active" ? " act" : ""}` : "—";
        const vals = [String(i + 1), r.label ?? "—", target, specParts.join(" · ") || "—", rest];
        let xx = innerLeft;
        for (let c = 0; c < cols.length; c++) {
          const w = colWidths[c];
          const align = cols[c].align;
          const tx = align === "center" ? xx + w / 2 : xx + 4;
          doc.text(String(vals[c] ?? "—"), tx, cursorY + 9, { align });
          xx += w;
        }
        cursorY += rowH;
      });
    }

    if (e.rpe != null) {
      setText(doc, C.text400);
      doc.setFont("courier", "normal");
      doc.setFontSize(9);
      doc.text(`RPE ${e.rpe}`, innerRight, cursorY + 10, { align: "right" });
      cursorY += 12;
    }

    if (notesLines.length) {
      setText(doc, C.text500);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(notesLines, innerLeft, cursorY + 6);
      cursorY += notesHpx;
    }

    if (!isLast) {
      cursorY += 4;
      setDraw(doc, C.borderLo);
      doc.setLineWidth(0.5);
      doc.line(innerLeft, cursorY, innerRight, cursorY);
      cursorY += 6;
    } else {
      cursorY += 4;
    }
  };

  function unitShort(u: "meters" | "seconds" | "minutes"): string {
    if (u === "meters") return "m";
    if (u === "seconds") return "s";
    return "min";
  }

  // ── Render ────────────────────────────────────────────────────────

  let drewAnything = false;

  for (const wk of orderedWeeks) {
    const days = wk.days
      .filter((d) => d.sessions.some((s) => s.exercises.length > 0))
      .sort((a, b) => a.day_number - b.day_number);
    if (!days.length) continue;

    const subtitle = opts.scope === "block" ? `Week ${wk.weekNumber}` : scopeLabel;
    newPage(subtitle);
    drewAnything = true;

    for (const day of days) {
      drawDayHeader(day.day_number);
      const sessions = day.sessions.filter((s) => s.exercises.length > 0);
      sessions.forEach((session, sIdx) => {
        const disciplines = Array.from(new Set(session.exercises.map((e) => e.discipline)));
        const mix = disciplines.join(" · ");
        drawSessionHeader(sIdx, sessions.length, session.name, mix);
        const sorted = [...session.exercises].sort((a, b) => a.order_index - b.order_index);
        sorted.forEach((ex, eIdx) => {
          const isLast = eIdx === sorted.length - 1;
          if (ex.structure_type === "intervals" || ex.structure_type === "template") drawIntervalsExercise(ex, isLast);
          else if (ex.discipline === "Strength") drawStrengthExercise(ex, isLast);
          else drawEnduranceExercise(ex, isLast);
        });
        cursorY += 6;
      });
      cursorY += 8;
    }
  }

  if (!drewAnything) {
    newPage(scopeLabel);
    setText(doc, C.text400);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("No exercises scheduled.", M, cursorY);
  }

  // Footers (after we know total page count)
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    drawFooter(i, pageCount);
  }

  const safeName = opts.clientName.replace(/\s+/g, "_");
  const tag =
    opts.scope === "day" ? "Day"
    : opts.scope === "week" ? `Week${orderedWeeks[0]?.weekNumber ?? ""}`
    : `Block${opts.blockName ? "_" + opts.blockName.replace(/\s+/g, "_") : ""}`;
  triggerPdfDownload(doc, `${safeName}_${tag}.pdf`);
}

// Robust download helper. jsPDF's doc.save() uses an anchor with the
// `download` attribute, which iOS Safari (and some in-iframe contexts)
// ignore — the click then appears to do nothing. We build the blob
// ourselves, try anchor download, and on iOS fall back to opening the
// blob URL in a new tab so the user can save/share it from the viewer.
function triggerPdfDownload(doc: jsPDF, filename: string) {
  try {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in (globalThis as any).document);

    if (isIOS) {
      // iOS Safari ignores the download attribute; open in a new tab
      // so the user gets the share/save sheet.
      const win = window.open(url, "_blank");
      if (!win) window.location.href = url;
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    // Last resort: jsPDF's built-in save.
    doc.save(filename);
  }
}