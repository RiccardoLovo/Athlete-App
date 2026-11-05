// Generates the review artifact's data file from the block JSONs, so the
// artifact is a view of the bank rather than a second copy of it.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const DIR = new URL("../../data/exercise-bank/", import.meta.url);
const OUT = new URL("../../data/exercise-bank/bank-data.js", import.meta.url);

const blocks = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8")));

const payload = {
  generated: new Date().toISOString().slice(0, 10),
  vocab: blocks[0].vocab,
  blocks: blocks.map((b) => ({ id: b.block, title: b.title, reviewed: b.reviewed })),
  exercises: blocks.flatMap((b) => b.exercises),
  edges: blocks.flatMap((b) => b.swap_edges),
};

writeFileSync(OUT, `window.BANK = ${JSON.stringify(payload)};\n`);
console.log(`bank-data.js: ${payload.exercises.length} exercises, ${payload.edges.length} edges, ${payload.blocks.length} blocks`);
