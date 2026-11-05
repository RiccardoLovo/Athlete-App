// Re-checks every demonstration video in the bank against YouTube's oEmbed
// endpoint: that it still exists, is still public, and still carries a title
// consistent with the exercise it is attached to.
//
// This exists because link rot is silent. A video that goes private breaks an
// athlete's demo link with no error anywhere, and nobody finds out until
// someone is standing in a gym looking at a dead player. Run it periodically.
//
//   node scripts/exercise-bank/verify-videos.mjs            # report only
//   node scripts/exercise-bank/verify-videos.mjs --strict   # exit 1 on any problem
import { readFileSync, readdirSync } from "node:fs";

const DIR = new URL("../../data/exercise-bank/", import.meta.url);
const strict = process.argv.includes("--strict");

const blocks = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()
  .map((f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8")));
const EX = blocks.flatMap((b) => b.exercises);

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// One request per distinct video, not per record — several exercises share a
// clip and that is already flagged on the records themselves.
const byVideo = new Map();
for (const e of EX) {
  if (!e.video) continue;
  if (!byVideo.has(e.video.id)) byVideo.set(e.video.id, []);
  byVideo.get(e.video.id).push(e);
}

const missing = EX.filter((e) => !e.video);
const dead = [], renamed = [], moved = [];
let ok = 0;

for (const [vid, exs] of byVideo) {
  const target = encodeURIComponent(`https://www.youtube.com/watch?v=${vid}`);
  let d;
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${target}&format=json`);
    if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 401 ? " (private or removed)" : ""}`);
    d = await r.json();
  } catch (err) {
    dead.push({ vid, exs, why: err.message });
    continue;
  }
  const authorNow = (d.author_name || "").trim();
  const authorWas = (exs[0].video.author || "").trim();
  if (authorNow !== authorWas) {
    moved.push({ vid, exs, was: authorWas, now: authorNow });
  }
  const core = d.title.split("|")[0].trim();
  const titleOk = exs.some((e) =>
    norm(core).includes(norm(e.name)) || norm(e.name).includes(norm(core)));
  const allKnown = exs.every((e) =>
    (e.flags || []).some((f) => f.field === "video"));
  if (!titleOk && !allKnown) renamed.push({ vid, exs, title: d.title });
  if (titleOk && authorNow === authorWas) ok++;
}

const total = EX.length;
const withVideo = total - missing.length;
console.log(`${withVideo}/${total} records have a video · ${byVideo.size} distinct clips · ${ok} fully clean`);

if (dead.length) {
  console.log(`\n${dead.length} DEAD — these break the demo link for athletes:`);
  for (const d of dead)
    console.log(`  ${d.vid}  ${d.exs.map((e) => e.id).join(", ")}  -> ${d.why}`);
}
if (moved.length) {
  console.log(`\n${moved.length} channel changed (attribution now wrong):`);
  for (const m of moved)
    console.log(`  ${m.vid}  "${m.was}" -> "${m.now}"  (${m.exs.map((e) => e.id).join(", ")})`);
}
if (renamed.length) {
  console.log(`\n${renamed.length} title differs from our name — a synonym, or the clip changed. Check once; flag the record if it is expected:`);
  for (const r of renamed)
    console.log(`  ${r.vid}  "${r.title}"  attached to ${r.exs.map((e) => e.id).join(", ")}`);
}
if (missing.length) {
  console.log(`\n${missing.length} record(s) with no video at all — need our own clip:`);
  for (const e of missing) console.log(`  ${e.id}  (${e.block})`);
}

const problems = dead.length + moved.length + renamed.length;
if (!problems && !missing.length) console.log("\nno problems");
if (strict && problems) process.exit(1);
