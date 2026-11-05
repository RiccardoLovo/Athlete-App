#!/usr/bin/env python3
"""Exercise bank: canonical JSON -> editable Excel workbook.

The JSON under data/exercise-bank/ is the source of truth. This writes a
workbook to edit offline; from_xlsx.py reads it back and validates before
anything is written to the JSON again. Never edit both and hope.

Multi-value fields are PIPE-delimited, not comma-delimited, because the
values themselves contain commas ("knee extension (large, fast)"). Commas
are what turned muscle_group into 30 inconsistent strings in the live app.

Usage:
    to_xlsx.py data/exercise-bank/01-lower-body-plyometrics.json [out.xlsx]
"""
import json
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

SEP = " | "

# column, width, wrap, source key, kind
EX_COLS = [
    ("id", 22, False, "id", "str"),
    ("name", 30, False, "name", "str"),
    ("aka", 24, False, "aka", "str"),
    ("family", 18, False, "family", "str"),
    ("modifiers", 30, True, "modifiers", "list"),
    ("pattern", 16, False, "pattern", "str"),
    ("plane", 12, False, "plane", "vocab:plane"),
    ("stance", 20, False, "stance", "vocab:stance"),
    ("per_side", 9, False, "perSide", "bool"),
    ("ssc", 8, False, "ssc", "vocab:ssc"),
    ("gct", 34, True, "gct", "str"),
    ("velocity", 22, False, "velocity", "str"),
    ("joint_actions", 46, True, "joints", "list"),
    ("agonists", 34, True, "agonists", "list"),
    ("synergists", 40, True, "synergists", "list"),
    ("stabilizers", 34, True, "stabilizers", "list"),
    ("position", 62, True, "position", "str"),
    ("resistance", 40, True, "resistance", "str"),
    ("length_bias", 13, False, "lengthBias", "vocab:length_bias"),
    ("admissible_intent", 28, True, "intents", "list"),
    ("dose", 36, True, "dose", "str"),
    ("stress_axial", 12, False, "stress.axial", "vocab:stress_level"),
    ("stress_flexion", 14, False, "stress.flexion", "vocab:stress_level"),
    ("stress_impact", 13, False, "stress.impact", "vocab:stress_level"),
    ("stress_landing", 14, False, "stress.landing", "vocab:stress_level"),
    ("stress_achilles", 15, False, "stress.achilles", "vocab:stress_level"),
    ("stress_knee", 12, False, "stress.knee", "vocab:stress_level"),
    ("stress_shoulder", 15, False, "stress.shoulder", "vocab:stress_level"),
    ("stress_elbow", 13, False, "stress.elbow", "vocab:stress_level"),
    ("equipment", 26, True, "equipment", "list"),
    ("equip_tier", 12, False, "equipTier", "vocab:equip_tier"),
    ("space", 26, True, "space", "str"),
    ("skill", 14, False, "skill", "vocab:skill"),
    ("cues", 54, True, "cues", "list"),
    ("video_id", 14, False, "video.id", "str"),
    ("video_author", 24, False, "video.author", "str"),
    ("video_note", 30, True, "video.note", "str"),
    ("notes", 40, True, "note", "str"),
]

EDGE_COLS = [
    ("from", 22, False, "from"),
    ("to", 24, False, "to"),
    ("reason", 14, False, "reason"),
    ("same", 46, True, "same"),
    ("changed", 52, True, "changed"),
    ("dose", 40, True, "dose"),
]

FLAG_COLS = [
    ("exercise_id", 22, False),
    ("field", 14, False),
    ("kind", 14, False),
    ("text", 90, True),
]

HEAD_FILL = PatternFill("solid", fgColor="1F2A33")
HEAD_FONT = Font(color="FFFFFF", bold=True, size=10, name="Calibri")
LOCK_FILL = PatternFill("solid", fgColor="EDF1F4")
MONO = Font(name="Consolas", size=10)


def dig(obj, path):
    cur = obj
    for part in path.split("."):
        if cur is None:
            return None
        cur = cur.get(part) if isinstance(cur, dict) else None
    return cur


def cell_value(ex, key, kind):
    v = dig(ex, key)
    if kind == "list":
        return SEP.join(v) if v else ""
    if kind == "bool":
        return "yes" if v else "no"
    return "" if v is None else str(v)


def style_header(ws, cols):
    for i, col in enumerate(cols, start=1):
        name, width = col[0], col[1]
        c = ws.cell(row=1, column=i, value=name)
        c.fill = HEAD_FILL
        c.font = HEAD_FONT
        c.alignment = Alignment(vertical="center")
        ws.column_dimensions[get_column_letter(i)].width = width
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = ws.dimensions


def add_validation(ws, col_idx, options, nrows, title):
    formula = '"' + ",".join(options) + '"'
    if len(formula) > 255:  # Excel's inline-list limit
        return
    dv = DataValidation(type="list", formula1=formula, allow_blank=True, showDropDown=False)
    dv.error = f"Pick one of: {', '.join(options)}"
    dv.errorTitle = f"{title} is a controlled field"
    dv.prompt = f"Allowed: {', '.join(options)}"
    dv.promptTitle = title
    ws.add_data_validation(dv)
    letter = get_column_letter(col_idx)
    dv.add(f"{letter}2:{letter}{max(nrows + 1, 400)}")


def build(src: Path, out: Path):
    data = json.loads(src.read_text())
    exercises = data["exercises"]
    edges = data["swap_edges"]
    vocab = data["vocab"]

    vocab_lists = {
        "plane": vocab["plane"],
        "stance": vocab["stance"],
        "ssc": [v["id"] for v in vocab["ssc"]],
        "stress_level": vocab["stress_level"],
        "skill": vocab["skill"],
        "equip_tier": vocab["equip_tier"],
        "length_bias": vocab["length_bias"],
    }

    wb = Workbook()

    # ---- read me ----
    ws = wb.active
    ws.title = "read me"
    ws.column_dimensions["A"].width = 112
    lines = [
        ("Exercise bank — editable workbook", True),
        ("", False),
        (f"Block: {data['title']}  ({data['block']})", False),
        (f"Generated from: {src.name}   ·   {len(exercises)} exercises, {len(edges)} swap edges", False),
        ("", False),
        ("HOW THIS ROUND-TRIPS", True),
        ("1. The JSON under data/exercise-bank/ is the source of truth. This workbook is a working copy.", False),
        ("2. Edit the 'exercises', 'swap edges' and 'flags' sheets. Add rows at the bottom; blank id = new exercise.", False),
        ("3. Hand it back and it is read with scripts/exercise-bank/from_xlsx.py, which validates before writing.", False),
        ("4. The consistency audit runs on import. A failing edge or an unknown vocabulary value stops the import.", False),
        ("", False),
        ("RULES THAT MATTER", True),
        ("· Multi-value cells are separated by ' | ' (pipe), never commas — the values contain commas themselves.", False),
        ("· Grey columns are controlled: pick from the dropdown. Typing a new value fails the import by design.", False),
        ("· Do not rename sheets, reorder columns, or change the header row.", False),
        ("· 'id' is the join key for swap edges and flags. Changing an id orphans them.", False),
        ("· Deleting a row deletes the exercise. To retire one instead, say so rather than removing the row.", False),
        ("", False),
        ("THE ONE THING TO CHECK FIRST", True),
        ("Swap edges with reason 'lumbar', 'knee' or 'achilles' are the only entries that could hurt someone.", False),
        ("The audit proves each one lowers stress on that tissue; it cannot prove the advice is clinically sound.", False),
        ("Those rows need a qualified sign-off before an athlete other than you relies on them.", False),
    ]
    for i, (text, bold) in enumerate(lines, start=1):
        c = ws.cell(row=i, column=1, value=text)
        c.font = Font(bold=bold, size=12 if bold and i == 1 else 11)
        c.alignment = Alignment(wrap_text=True, vertical="top")

    # ---- exercises ----
    ws = wb.create_sheet("exercises")
    style_header(ws, EX_COLS)
    for r, ex in enumerate(exercises, start=2):
        for i, (name, _w, wrap, key, kind) in enumerate(EX_COLS, start=1):
            c = ws.cell(row=r, column=i, value=cell_value(ex, key, kind))
            c.alignment = Alignment(wrap_text=wrap, vertical="top")
            if kind.startswith("vocab:") or kind == "bool":
                c.fill = LOCK_FILL
            if name in ("id", "video_id"):
                c.font = MONO
    for i, (name, _w, _wrap, _key, kind) in enumerate(EX_COLS, start=1):
        if kind.startswith("vocab:"):
            add_validation(ws, i, vocab_lists[kind.split(":", 1)[1]], len(exercises), name)
        elif kind == "bool":
            add_validation(ws, i, ["yes", "no"], len(exercises), name)

    # ---- swap edges ----
    ws = wb.create_sheet("swap edges")
    style_header(ws, EDGE_COLS)
    for r, e in enumerate(edges, start=2):
        for i, (_name, _w, wrap, key) in enumerate(EDGE_COLS, start=1):
            c = ws.cell(row=r, column=i, value=e.get(key, "") or "")
            c.alignment = Alignment(wrap_text=wrap, vertical="top")
            if key in ("from", "to"):
                c.font = MONO
    add_validation(ws, 3, [r["id"] for r in vocab["swap_reason"]], len(edges), "reason")

    # ---- flags ----
    ws = wb.create_sheet("flags")
    style_header(ws, FLAG_COLS)
    r = 2
    for ex in exercises:
        for f in ex.get("flags") or []:
            ws.cell(row=r, column=1, value=ex["id"]).font = MONO
            ws.cell(row=r, column=2, value=f["field"])
            ws.cell(row=r, column=3, value=f["kind"])
            c = ws.cell(row=r, column=4, value=f["text"])
            c.alignment = Alignment(wrap_text=True, vertical="top")
            r += 1
    add_validation(ws, 3, vocab["provenance"], r, "kind")

    # ---- vocabulary ----
    ws = wb.create_sheet("vocabulary")
    ws.column_dimensions["A"].width = 18
    ws.column_dimensions["B"].width = 26
    ws.column_dimensions["C"].width = 86
    for i, name in enumerate(("field", "allowed value", "definition"), start=1):
        c = ws.cell(row=1, column=i, value=name)
        c.fill = HEAD_FILL
        c.font = HEAD_FONT
    r = 2
    for v in vocab["ssc"]:
        ws.cell(row=r, column=1, value="ssc")
        ws.cell(row=r, column=2, value=v["id"])
        c = ws.cell(row=r, column=3, value=f"{v['label']} — {v['definition']}")
        c.alignment = Alignment(wrap_text=True, vertical="top")
        r += 1
    for v in vocab["swap_reason"]:
        ws.cell(row=r, column=1, value="swap_reason")
        ws.cell(row=r, column=2, value=v["id"])
        ws.cell(row=r, column=3, value=v["label"])
        r += 1
    for field in ("stress_level", "skill", "plane", "stance", "provenance"):
        for v in vocab[field]:
            ws.cell(row=r, column=1, value=field)
            ws.cell(row=r, column=2, value=v)
            r += 1
    ws.freeze_panes = "A2"

    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    print(f"wrote {out}")
    print(f"  exercises sheet: {len(exercises)} rows x {len(EX_COLS)} cols")
    print(f"  swap edges:      {len(edges)} rows")
    print(f"  flags:           {r - 2} vocabulary rows")


if __name__ == "__main__":
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(".xlsx")
    build(src, out)
