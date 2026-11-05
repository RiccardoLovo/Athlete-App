// Consistency gate for the exercise bank. Runs across every block JSON.
// Safety-critical rule: a substitute offered for an injury must not raise
// load on the tissue it is offered to protect.
import { readFileSync, readdirSync } from "node:fs";

const DIR = new URL("../../data/exercise-bank/", import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();

const RANK = { low: 0, mod: 1, high: 2 };
const SKILL = { entry: 0, intermediate: 1, advanced: 2 };
const TISSUE = { lumbar: ["axial", "flexion", "impact"], achilles: ["achilles"],
  knee: ["knee"], shoulder: ["shoulder"], elbow: ["elbow"] };
const STRESS_FIELDS = ["axial", "flexion", "impact", "landing", "achilles", "knee", "shoulder", "elbow"];
const TIERS = ["none", "home", "minimal", "gym", "specialist"];

const blocks = files.map((f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8")));
const EX = blocks.flatMap((b) => b.exercises);
const EDGES = blocks.flatMap((b) => b.swap_edges.map((e) => ({ ...e, block: b.block })));
const byId = Object.fromEntries(EX.map((e) => [e.id, e]));

const errors = [], warns = [], notes = [];

if (new Set(EX.map((e) => e.id)).size !== EX.length) {
  const seen = new Set(), dupes = new Set();
  for (const e of EX) (seen.has(e.id) ? dupes : seen).add(e.id);
  errors.push(`duplicate exercise ids across blocks: ${[...dupes].join(", ")}`);
}

const REQUIRED = ["name", "family", "pattern", "plane", "stance", "ssc", "velocity",
  "joints", "agonists", "stabilizers", "position", "resistance", "intents", "dose",
  "stress", "space", "skill", "cues"];
for (const e of EX) {
  for (const k of REQUIRED) {
    const v = e[k];
    if (v == null || v === "" || (Array.isArray(v) && !v.length))
      errors.push(`${e.id}: missing ${k}`);
  }
  for (const k of STRESS_FIELDS)
    if (!(e.stress?.[k] in RANK)) errors.push(`${e.id}: stress.${k} invalid (${e.stress?.[k]})`);
  if (!TIERS.includes(e.equipTier)) errors.push(`${e.id}: equipTier invalid (${e.equipTier})`);
  const its = e.intents.join(" ").toLowerCase();
  if (e.ssc === "none" && /reactive/.test(its))
    errors.push(`${e.id}: no-SSC but claims a reactive intent`);
  if (e.ssc === "fast" && !/reactive|stiffness|power|conditioning|mechanics|coordination|cadence/.test(its))
    warns.push(`${e.id}: fast SSC but intents are "${e.intents.join(", ")}"`);
  // stance and perSide are independent: stance is the base of support,
  // perSide is whether reps are prescribed left and right. A Pallof press is
  // bilateral-stance and per-side; only the reverse is an inconsistency,
  // because a single-leg exercise must have a side count.
  const uni = e.stance.startsWith("unilateral") && !/alternating/.test(e.stance);
  if (uni && !e.perSide)
    warns.push(`${e.id}: stance "${e.stance}" but perSide is false`);
  if (e.perSide && !/per side/i.test(e.dose)) warns.push(`${e.id}: per-side but dose omits "per side"`);
  if (!e.video) notes.push(`${e.id}: no video`);
}

const edgeKeys = new Set();
for (const e of EDGES) {
  const key = `${e.from}>${e.to}>${e.reason}`;
  if (edgeKeys.has(key)) errors.push(`duplicate edge ${key}`);
  edgeKeys.add(key);
  const a = byId[e.from], b = byId[e.to];
  if (!a) { errors.push(`edge from unknown exercise "${e.from}"`); continue; }
  if (!b) { errors.push(`edge to unknown exercise "${e.to}"`); continue; }
  if (e.from === e.to) { errors.push(`${e.from} substitutes for itself`); continue; }

  const keys = TISSUE[e.reason];
  if (keys) {
    const worse = keys.filter((k) => RANK[b.stress[k]] > RANK[a.stress[k]]);
    const better = keys.filter((k) => RANK[b.stress[k]] < RANK[a.stress[k]]);
    if (worse.length)
      errors.push(`UNSAFE ${e.from} -> ${e.to} (${e.reason}) raises ` +
        worse.map((k) => `${k} ${a.stress[k]}->${b.stress[k]}`).join(", "));
    else if (!better.length)
      warns.push(`${e.from} -> ${e.to} (${e.reason}) lowers nothing on ${keys.join("/")}`);
  }
  if (e.reason === "harder" && SKILL[b.skill] > SKILL[a.skill])
    errors.push(`${e.from} -> ${e.to} offered as easier but skill rises ${a.skill} -> ${b.skill}`);
  if (e.reason === "equipment" && TIERS.indexOf(b.equipTier) > TIERS.indexOf(a.equipTier))
    errors.push(`${e.from} -> ${e.to} (equipment) needs HARDER-to-reach kit: ${a.equipTier} -> ${b.equipTier}`);
  else if (e.reason === "equipment" && b.equipTier === a.equipTier && a.equipTier !== "none")
    warns.push(`${e.from} -> ${e.to} (equipment) stays at tier "${a.equipTier}"`);
  // A missing field is a reporting problem, not a crash — an edge with no
  // dose note is incomplete and should be named, not thrown on.
  for (const f of ["same", "changed", "dose"])
    if (!e[f]) errors.push(`edge ${e.from}->${e.to} (${e.reason}) has no "${f}" text`);
}

const touched = new Set(EDGES.flatMap((e) => [e.from, e.to]));
const orphans = EX.filter((e) => !touched.has(e.id));

console.log(`blocks: ${blocks.map((b) => `${b.block} (${b.exercises.length})`).join(", ")}`);
console.log(`total: ${EX.length} exercises, ${EDGES.length} swap edges`);
console.log(`unilateral: ${EX.filter((e) => e.perSide).length} · no equipment: ${EX.filter((e) => !e.equipment.length).length} · flagged: ${EX.filter((e) => e.flags).length}`);
console.log(`patterns: ${[...new Set(EX.map((e) => e.pattern))].sort().join(", ")}`);
console.log(`dose unchanged on swap: ${EDGES.filter((e) => /^unchanged/i.test((e.dose ?? "").trim())).length} of ${EDGES.length}`);
console.log(`orphans (no curated edge): ${orphans.length}${orphans.length ? " — " + orphans.map((e) => e.id).join(", ") : ""}`);
if (notes.length) console.log(`\n${notes.length} note(s):\n  ` + notes.join("\n  "));
if (warns.length) console.log(`\n${warns.length} warning(s):\n  ` + warns.join("\n  "));
if (errors.length) {
  console.log(`\n${errors.length} ERROR(S):\n  ` + errors.join("\n  "));
  process.exit(1);
}
console.log("\nno errors");
