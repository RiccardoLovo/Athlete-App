import jsPDF from "jspdf";
import { DAY_LABELS } from "./constants";
import type { Discipline } from "./prescription";

// ─────────────────────────────────────────────────────────────────────
// CoachDesk training PDF. Landscape A4, dark theme — the exact palette
// and card language the app itself uses (rounded-card exercises, thin
// hairlines, one clean summary line per exercise instead of a data
// grid). Strength and endurance exercises share the same card layout;
// only interval-structured exercises get a round-by-round table.
// ─────────────────────────────────────────────────────────────────────

export interface PdfExercise {
  name: string;
  discipline: Discipline;
  order_index: number;
  notes: string;
  video_url: string | null;
  // One-line prescription summary (summarizePrescription output) — used
  // verbatim for strength and endurance exercises alike.
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
  name: string | null; // e.g. "AM Strength", null if unnamed
  exercises: PdfExercise[];
}

export interface PdfDay {
  day_number: number; // 0=Mon..6=Sun
  sessions: PdfSession[];
}

export interface PdfWeek {
  weekNumber: number;
  days: PdfDay[];
}

export type TrainingPdfScope = "day" | "week" | "block";

// RGB palette — converted 1:1 from the app's monochrome dark-theme oklch
// tokens in src/styles.css, so the export matches the product exactly
// rather than approximating it. Pure grayscale by design.
const C = {
  bg: [10, 10, 10] as [number, number, number], // --background
  card: [22, 22, 22] as [number, number, number], // --card
  border: [39, 39, 39] as [number, number, number], // --border (12% white on bg)
  borderLo: [25, 25, 25] as [number, number, number], // faint hairline (6% white on bg)
  text: [242, 242, 242] as [number, number, number], // --foreground
  textMuted: [164, 164, 164] as [number, number, number], // --muted-foreground
  textDim: [102, 102, 102] as [number, number, number], // dimmer still, for kickers
  primary: [228, 228, 228] as [number, number, number], // --primary
};

function setFill(doc: jsPDF, c: [number, number, number]) {
  doc.setFillColor(c[0], c[1], c[2]);
}
function setText(doc: jsPDF, c: [number, number, number]) {
  doc.setTextColor(c[0], c[1], c[2]);
}
function setDraw(doc: jsPDF, c: [number, number, number]) {
  doc.setDrawColor(c[0], c[1], c[2]);
}

// Cosmetic only: summarizePrescription joins segments with " | " for
// compactness in-app; the export has room to breathe, so give it a
// lighter separator.
function prettySummary(s: string): string {
  return s.replace(/ \| /g, "    ·    ");
}

export function exportTrainingPdf(opts: {
  scope: TrainingPdfScope;
  clientName: string;
  sport: string;
  blockName?: string;
  weeks: PdfWeek[];
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(); // ~842
  const H = doc.internal.pageSize.getHeight(); // ~595
  const M = 40; // page margin
  const HEADER_H = 58;
  const FOOTER_H = 30;
  const RADIUS = 6;

  const scopeLabel =
    opts.scope === "day"
      ? "Daily Plan"
      : opts.scope === "week"
        ? "Weekly Plan"
        : "Block Plan";

  const orderedWeeks = [...opts.weeks].sort(
    (a, b) => a.weekNumber - b.weekNumber,
  );
  let currentSubtitle = scopeLabel;

  const paintBackground = () => {
    setFill(doc, C.bg);
    doc.rect(0, 0, W, H, "F");
  };

  const drawHeader = (subtitle: string) => {
    setFill(doc, C.card);
    doc.rect(0, 0, W, HEADER_H, "F");
    setDraw(doc, C.border);
    doc.setLineWidth(0.75);
    doc.line(0, HEADER_H, W, HEADER_H);

    setText(doc, C.textDim);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("CoachDesk · Training Export", M, 22);

    setText(doc, C.text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(opts.clientName, M, 43);

    // Right side
    const meta = [opts.sport, opts.blockName].filter(Boolean).join("  ·  ");
    setText(doc, C.textMuted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    if (meta) doc.text(meta, W - M, 22, { align: "right" });

    setText(doc, C.primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(subtitle, W - M, 43, { align: "right" });
  };

  const drawFooter = (pageNum: number, pageTotal: number) => {
    setDraw(doc, C.borderLo);
    doc.setLineWidth(0.5);
    doc.line(M, H - FOOTER_H, W - M, H - FOOTER_H);
    setText(doc, C.textDim);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("CoachDesk", M, H - 13);
    doc.text(`${pageNum} / ${pageTotal}`, W - M, H - 13, { align: "right" });
  };

  let cursorY = 0;
  const contentTop = HEADER_H + 22;
  const contentBottom = H - FOOTER_H - 6;

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
    ensureSpace(34);
    const label = DAY_LABELS[dayNumber] ?? `Day ${dayNumber + 1}`;
    setFill(doc, C.primary);
    doc.roundedRect(M, cursorY + 3, 3, 18, 1.5, 1.5, "F");
    setText(doc, C.text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(label, M + 12, cursorY + 16);
    cursorY += 32;
  };

  const drawSessionHeader = (
    sessionIdx: number,
    totalSessions: number,
    name: string | null,
    mix: string,
  ) => {
    ensureSpace(22);
    const label =
      totalSessions > 1
        ? `Session ${sessionIdx + 1} — ${name ?? mix}`
        : (name ?? mix);
    setText(doc, C.textMuted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label.toUpperCase(), M, cursorY + 9);
    setDraw(doc, C.borderLo);
    doc.setLineWidth(0.5);
    doc.line(M, cursorY + 14, W - M, cursorY + 14);
    cursorY += 22;
  };

  // jsPDF's built-in fonts only cover WinAnsi — glyphs like ▶ silently
  // render as garbage, so the video link is a plain (legible) text label.
  const drawVideoMark = (url: string, afterX: number, y: number) => {
    setText(doc, C.primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.textWithLink("WATCH", afterX, y, { url });
  };

  // Strength and endurance exercises share this layout: a rounded card
  // with the name on top and a single prescription summary line below —
  // the same string the athlete sees in the app, just given room to
  // breathe instead of a bordered data grid.
  const drawSimpleExercise = (e: PdfExercise, isLast: boolean) => {
    const innerLeft = M + 12;
    const innerRight = W - M - 12;
    const innerW = innerRight - innerLeft;
    const summary = prettySummary(e.summary) || "—";
    const summaryLines = doc.splitTextToSize(summary, innerW);
    const notesLines = e.notes ? doc.splitTextToSize(e.notes, innerW) : [];
    const nameH = 20;
    const summaryH = summaryLines.length * 12;
    const notesH = notesLines.length ? notesLines.length * 10 + 6 : 0;
    const padY = 10;
    const cardH = padY + nameH + summaryH + notesH + padY - 2;
    const gap = isLast ? 6 : 8;
    ensureSpace(cardH + gap);

    setFill(doc, C.card);
    setDraw(doc, C.border);
    doc.setLineWidth(0.75);
    doc.roundedRect(M, cursorY, W - 2 * M, cardH, RADIUS, RADIUS, "FD");

    let ty = cursorY + padY;
    setText(doc, C.text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(e.name, innerLeft, ty + 9);
    if (e.video_url) {
      drawVideoMark(
        e.video_url,
        innerLeft + doc.getTextWidth(e.name) + 8,
        ty + 9,
      );
    }
    ty += nameH;

    setText(doc, C.text);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(summaryLines, innerLeft, ty + 8);
    ty += summaryH;

    if (notesLines.length) {
      setText(doc, C.textMuted);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.text(notesLines, innerLeft, ty + 6);
    }

    cursorY += cardH + gap;
  };

  const drawIntervalsExercise = (e: PdfExercise, isLast: boolean) => {
    const innerLeft = M + 12;
    const innerRight = W - M - 12;
    const innerW = innerRight - innerLeft;
    const rows = e.intervals ?? [];
    const padY = 10;
    const nameH = 20;
    const tableHeaderH = 16;
    const rowH = 15;
    const notesLines = e.notes ? doc.splitTextToSize(e.notes, innerW) : [];
    const notesH = notesLines.length ? notesLines.length * 10 + 6 : 0;
    const cardH =
      padY +
      nameH +
      tableHeaderH +
      rowH * Math.max(rows.length, 1) +
      notesH +
      padY -
      2;
    const gap = isLast ? 6 : 8;
    ensureSpace(cardH + gap);

    setFill(doc, C.card);
    setDraw(doc, C.border);
    doc.setLineWidth(0.75);
    doc.roundedRect(M, cursorY, W - 2 * M, cardH, RADIUS, RADIUS, "FD");

    let ty = cursorY + padY;
    setText(doc, C.text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(e.name, innerLeft, ty + 9);
    if (e.video_url) {
      drawVideoMark(
        e.video_url,
        innerLeft + doc.getTextWidth(e.name) + 8,
        ty + 9,
      );
    }
    setText(doc, C.textDim);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(
      `${e.discipline} · ${rows.length || 0} rounds`,
      innerRight,
      ty + 9,
      { align: "right" },
    );
    ty += nameH;

    // Column layout: #, target, spec (pace/watts/zone/stroke/intensity), rest.
    const colX = {
      n: innerLeft,
      target: innerLeft + 26,
      label: innerLeft + 100,
      spec: innerLeft + innerW * 0.58,
      rest: innerRight - 90,
    };

    setText(doc, C.textDim);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("#", colX.n, ty + 9);
    doc.text("TARGET", colX.target, ty + 9);
    doc.text("LABEL", colX.label, ty + 9);
    doc.text("DETAIL", colX.spec, ty + 9);
    doc.text("REST", colX.rest, ty + 9);
    setDraw(doc, C.borderLo);
    doc.setLineWidth(0.5);
    doc.line(innerLeft, ty + 13, innerRight, ty + 13);
    ty += tableHeaderH;

    if (!rows.length) {
      setText(doc, C.textMuted);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.text("No rounds configured", innerLeft, ty + 10);
      ty += rowH;
    } else {
      rows.forEach((r, i) => {
        if (i % 2 === 1) {
          setFill(doc, C.borderLo);
          doc.rect(innerLeft - 2, ty, innerW + 4, rowH, "F");
        }
        setText(doc, C.textMuted);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.text(String(i + 1), colX.n, ty + 10.5);

        setText(doc, C.text);
        const target =
          r.target_value != null
            ? `${r.target_value}${unitShort(r.target_unit)}`
            : "—";
        doc.text(target, colX.target, ty + 10.5);

        setText(doc, C.textMuted);
        doc.text(r.label ?? "—", colX.label, ty + 10.5);

        const specParts: string[] = [];
        if (r.pace_per_km) specParts.push(r.pace_per_km);
        if (r.watts != null) specParts.push(`${r.watts}W`);
        if (r.hr_zone != null) specParts.push(`Z${r.hr_zone}`);
        if (r.cadence != null) specParts.push(`${r.cadence}rpm`);
        if (r.stroke) specParts.push(r.stroke);
        if (r.intensity) specParts.push(r.intensity);
        doc.text(specParts.join("  ·  ") || "—", colX.spec, ty + 10.5);

        const rest =
          r.rest_seconds != null
            ? `${r.rest_seconds}s${r.rest_type === "active" ? " active" : ""}`
            : "—";
        doc.text(rest, colX.rest, ty + 10.5);
        ty += rowH;
      });
    }

    if (notesLines.length) {
      setText(doc, C.textMuted);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.text(notesLines, innerLeft, ty + 6);
    }

    cursorY += cardH + gap;
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

    const subtitle =
      opts.scope === "block" ? `Week ${wk.weekNumber}` : scopeLabel;
    newPage(subtitle);
    drewAnything = true;

    for (const day of days) {
      drawDayHeader(day.day_number);
      const sessions = day.sessions.filter((s) => s.exercises.length > 0);
      sessions.forEach((session, sIdx) => {
        const disciplines = Array.from(
          new Set(session.exercises.map((e) => e.discipline)),
        );
        const mix = disciplines.join(" · ");
        drawSessionHeader(sIdx, sessions.length, session.name, mix);
        const sorted = [...session.exercises].sort(
          (a, b) => a.order_index - b.order_index,
        );
        sorted.forEach((ex, eIdx) => {
          const isLast = eIdx === sorted.length - 1;
          if (
            ex.structure_type === "intervals" ||
            ex.structure_type === "template"
          )
            drawIntervalsExercise(ex, isLast);
          else drawSimpleExercise(ex, isLast);
        });
        cursorY += 6;
      });
      cursorY += 6;
    }
  }

  if (!drewAnything) {
    newPage(scopeLabel);
    setText(doc, C.textMuted);
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
    opts.scope === "day"
      ? "Day"
      : opts.scope === "week"
        ? `Week${orderedWeeks[0]?.weekNumber ?? ""}`
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
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && "ontouchend" in (globalThis as any).document);

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
