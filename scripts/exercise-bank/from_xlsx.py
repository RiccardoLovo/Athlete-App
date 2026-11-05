#!/usr/bin/env python3
"""Exercise bank: edited Excel workbook -> canonical JSON, with validation.

Nothing is written unless every check passes. The point is that a typo in a
controlled field, a swap edge pointing at a deleted exercise, or a
contraindication edge that raises stress on the tissue it claims to protect
all stop the import rather than quietly entering the bank.

Usage:
    from_xlsx.py edited.xlsx data/exercise-bank/01-lower-body-plyometrics.json
    from_xlsx.py edited.xlsx target.json --write    # actually write
"""
import json
import sys
from pathlib import Path

from openpyxl import load_workbook

from to_xlsx import EX_COLS, SEP

RANK = {"low": 0, "mod": 1, "high": 2}
SKILL_RANK = {"entry": 0, "intermediate": 1, "advanced": 2}
TISSUE = {"lumbar": ["axial", "flexion", "impact"], "achilles": ["achilles"],
          "knee": ["knee"], "shoulder": ["shoulder"], "elbow": ["elbow"]}
TIERS = ["none", "home", "minimal", "gym", "specialist"]


def split_list(v):
    if not v:
        return []
    raw = str(v)
    parts = [p.strip() for p in raw.split("|")]
    return [p for p in parts if p]


def read_rows(ws):
    headers = [c.value for c in ws[1]]
    out = []
    for row in ws.iter_rows(min_row=2):
        vals = [c.value for c in row]
        if all(v is None or str(v).strip() == "" for v in vals):
            continue
        out.append({h: (v if v is not None else "") for h, v in zip(headers, vals)})
    return out


def rebuild(src_xlsx: Path, vocab: dict):
    wb = load_workbook(src_xlsx, data_only=True)
    errors, warnings = [], []

    for sheet in ("exercises", "swap edges", "flags"):
        if sheet not in wb.sheetnames:
            errors.append(f"workbook is missing the '{sheet}' sheet")
    if errors:
        return None, None, errors, warnings

    ex_rows = read_rows(wb["exercises"])
    edge_rows = read_rows(wb["swap edges"])
    flag_rows = read_rows(wb["flags"])

    expected = [c[0] for c in EX_COLS]
    actual = [c.value for c in wb["exercises"][1]][: len(expected)]
    if actual != expected:
        errors.append(
            "the 'exercises' header row has changed — columns must keep their original "
            f"names and order.\n    expected: {expected}\n    found:    {actual}"
        )
        return None, None, errors, warnings

    allowed = {
        "plane": set(vocab["plane"]),
        "stance": set(vocab["stance"]),
        "ssc": {v["id"] for v in vocab["ssc"]},
        "stress_level": set(vocab["stress_level"]),
        "skill": set(vocab["skill"]),
        "equip_tier": set(vocab["equip_tier"]),
        "length_bias": set(vocab["length_bias"]),
        "provenance": set(vocab["provenance"]),
        "swap_reason": {r["id"] for r in vocab["swap_reason"]},
    }

    flags_by_ex = {}
    for i, r in enumerate(flag_rows, start=2):
        exid = str(r.get("exercise_id", "")).strip()
        kind = str(r.get("kind", "")).strip()
        if not exid:
            errors.append(f"flags row {i}: no exercise_id")
            continue
        if kind not in allowed["provenance"]:
            errors.append(f"flags row {i}: kind '{kind}' is not one of {sorted(allowed['provenance'])}")
        flags_by_ex.setdefault(exid, []).append(
            {"field": str(r.get("field", "")).strip(), "kind": kind, "text": str(r.get("text", "")).strip()}
        )

    exercises, seen = [], set()
    for i, r in enumerate(ex_rows, start=2):
        exid = str(r.get("id", "")).strip()
        if not exid:
            errors.append(f"exercises row {i}: blank id — give the new exercise a kebab-case id")
            continue
        if exid in seen:
            errors.append(f"exercises row {i}: duplicate id '{exid}'")
            continue
        seen.add(exid)

        def check(field, vocab_key, value):
            if value and value not in allowed[vocab_key]:
                errors.append(
                    f"exercises row {i} ({exid}): {field} = '{value}' is not allowed. "
                    f"Pick from {sorted(allowed[vocab_key])}"
                )

        ssc = str(r.get("ssc", "")).strip()
        plane = str(r.get("plane", "")).strip()
        stance = str(r.get("stance", "")).strip()
        skill = str(r.get("skill", "")).strip()
        check("ssc", "ssc", ssc)
        check("plane", "plane", plane)
        check("stance", "stance", stance)
        check("skill", "skill", skill)
        equip_tier = str(r.get("equip_tier", "")).strip()
        length_bias = str(r.get("length_bias", "")).strip()
        check("equip_tier", "equip_tier", equip_tier)
        if length_bias:
            check("length_bias", "length_bias", length_bias)

        stress = {}
        for key in ("axial", "flexion", "impact", "landing", "achilles", "knee",
                    "shoulder", "elbow"):
            val = str(r.get(f"stress_{key}", "")).strip()
            check(f"stress_{key}", "stress_level", val)
            stress[key] = val

        per_side = str(r.get("per_side", "")).strip().lower() in ("yes", "true", "1")
        intents = split_list(r.get("admissible_intent"))
        dose = str(r.get("dose", "")).strip()

        if ssc == "none" and any("reactive" in t.lower() for t in intents):
            errors.append(f"exercises row {i} ({exid}): no-SSC drill cannot have a reactive intent")
        if ssc == "fast" and not any(("reactive" in t.lower() or "stiffness" in t.lower()) for t in intents):
            warnings.append(f"{exid}: fast SSC but intents are {intents}")
        if per_side and "per side" not in dose.lower():
            warnings.append(f"{exid}: per-side but dose does not say 'per side': '{dose}'")

        video = None
        vid = str(r.get("video_id", "")).strip()
        if vid:
            video = {"id": vid, "author": str(r.get("video_author", "")).strip()}
            if str(r.get("video_note", "")).strip():
                video["note"] = str(r.get("video_note", "")).strip()

        ex = {
            "id": exid,
            "name": str(r.get("name", "")).strip(),
            "aka": str(r.get("aka", "")).strip() or None,
            "family": str(r.get("family", "")).strip(),
            "modifiers": split_list(r.get("modifiers")),
            "pattern": str(r.get("pattern", "")).strip(),
            "plane": plane,
            "stance": stance,
            "perSide": per_side,
            "ssc": ssc,
            "gct": str(r.get("gct", "")).strip(),
            "velocity": str(r.get("velocity", "")).strip(),
            "joints": split_list(r.get("joint_actions")),
            "agonists": split_list(r.get("agonists")),
            "synergists": split_list(r.get("synergists")),
            "stabilizers": split_list(r.get("stabilizers")),
            "position": str(r.get("position", "")).strip(),
            "resistance": str(r.get("resistance", "")).strip(),
            "lengthBias": length_bias or None,
            "intents": intents,
            "dose": dose,
            "stress": stress,
            "equipment": split_list(r.get("equipment")),
            "equipTier": equip_tier,
            "space": str(r.get("space", "")).strip(),
            "skill": skill,
            "cues": split_list(r.get("cues")),
            "video": video,
        }
        if str(r.get("notes", "")).strip():
            ex["note"] = str(r.get("notes", "")).strip()
        if exid in flags_by_ex:
            ex["flags"] = flags_by_ex[exid]

        for required in ("name", "family", "pattern", "ssc", "dose"):
            if not ex[required]:
                errors.append(f"exercises row {i} ({exid}): {required} is empty")
        exercises.append(ex)

    by_id = {e["id"]: e for e in exercises}

    for exid in flags_by_ex:
        if exid not in by_id:
            errors.append(f"flags sheet references unknown exercise '{exid}'")

    edges = []
    for i, r in enumerate(edge_rows, start=2):
        frm = str(r.get("from", "")).strip()
        to = str(r.get("to", "")).strip()
        reason = str(r.get("reason", "")).strip()
        if not frm or not to:
            errors.append(f"swap edges row {i}: from/to must both be set")
            continue
        if frm not in by_id:
            errors.append(f"swap edges row {i}: 'from' id '{frm}' is not an exercise")
            continue
        if to not in by_id:
            errors.append(f"swap edges row {i}: 'to' id '{to}' is not an exercise")
            continue
        if reason not in allowed["swap_reason"]:
            errors.append(f"swap edges row {i}: reason '{reason}' is not one of {sorted(allowed['swap_reason'])}")
            continue
        if frm == to:
            errors.append(f"swap edges row {i}: an exercise cannot substitute for itself")
            continue

        a, b = by_id[frm], by_id[to]
        keys = TISSUE.get(reason)
        if keys:
            worse = [k for k in keys if RANK.get(b["stress"][k], 9) > RANK.get(a["stress"][k], -1)]
            better = [k for k in keys if RANK.get(b["stress"][k], 9) < RANK.get(a["stress"][k], -1)]
            if worse:
                errors.append(
                    f"swap edges row {i}: {frm} -> {to} for '{reason}' INCREASES "
                    + ", ".join(f"{k} {a['stress'][k]}->{b['stress'][k]}" for k in worse)
                    + ". A substitute offered for an injury must not raise load on that tissue."
                )
            elif not better:
                warnings.append(f"{frm} -> {to} ({reason}) does not lower {'/'.join(keys)} on any field")
        if reason == "harder" and SKILL_RANK.get(b["skill"], 0) > SKILL_RANK.get(a["skill"], 0):
            errors.append(
                f"swap edges row {i}: {frm} -> {to} offered as easier but skill rises "
                f"{a['skill']} -> {b['skill']}"
            )

        edges.append(
            {
                "from": frm,
                "to": to,
                "reason": reason,
                "same": str(r.get("same", "")).strip(),
                "changed": str(r.get("changed", "")).strip(),
                "dose": str(r.get("dose", "")).strip(),
            }
        )

    return exercises, edges, errors, warnings


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    src = Path(sys.argv[1])
    target = Path(sys.argv[2])
    do_write = "--write" in sys.argv

    block = json.loads(target.read_text())
    exercises, edges, errors, warnings = rebuild(src, block["vocab"])
    # `block` is implied by which file this is, not stored in the sheet.
    for ex in exercises or []:
        ex["block"] = block["block"]

    for w in warnings:
        print(f"  warn   {w}")
    if errors:
        print(f"\n{len(errors)} error(s) — nothing written:\n")
        for e in errors:
            print(f"  ERROR  {e}")
        sys.exit(1)

    before_ex, before_ed = len(block["exercises"]), len(block["swap_edges"])
    print(f"\nvalidated: {len(exercises)} exercises ({before_ex} before), "
          f"{len(edges)} edges ({before_ed} before), {len(warnings)} warning(s)")

    old_ids = {e["id"] for e in block["exercises"]}
    new_ids = {e["id"] for e in exercises}
    if new_ids - old_ids:
        print(f"  added:   {', '.join(sorted(new_ids - old_ids))}")
    if old_ids - new_ids:
        print(f"  REMOVED: {', '.join(sorted(old_ids - new_ids))}")

    if not do_write:
        print("\ndry run — pass --write to update the JSON")
        return

    block["exercises"] = exercises
    block["swap_edges"] = edges
    target.write_text(json.dumps(block, indent=2) + "\n")
    print(f"\nwrote {target}")


if __name__ == "__main__":
    main()
