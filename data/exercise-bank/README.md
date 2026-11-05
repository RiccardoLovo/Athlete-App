# Exercise bank

Nine blocks of annotated exercises, built for the live-swap feature: an
athlete mid-session says *why* they need to change an exercise — the kit is
taken, something hurts, it's too hard today — and the engine answers with
substitutes that hold the training quality constant.

## Layout

| Path | Role |
|---|---|
| `NN-*.json` | **Source of truth.** One file per block. |
| `NN-*.xlsx` | Editable working copy, generated from the JSON. |
| `bank-data.js` | Generated view for the review artifact. Never edit. |

## Round-trip

```sh
python3 -m venv .venv
.venv/bin/pip install -r ../../scripts/exercise-bank/requirements.txt

# JSON -> workbook (controlled columns become dropdowns)
.venv/bin/python ../../scripts/exercise-bank/to_xlsx.py 01-lower-body-plyometrics.json

# workbook -> JSON, validated; omit --write for a dry run
.venv/bin/python ../../scripts/exercise-bank/from_xlsx.py 01-lower-body-plyometrics.xlsx \
    01-lower-body-plyometrics.json --write

node ../../scripts/exercise-bank/audit.mjs        # gate: must exit 0
node ../../scripts/exercise-bank/build-artifact.mjs

# push the bank into Postgres (idempotent; safe to re-run after any edit)
node ../../scripts/exercise-bank/import-sql.mjs > /tmp/import.sql
supabase db query --linked -f /tmp/import.sql
```

## Check the videos periodically

```sh
node ../../scripts/exercise-bank/verify-videos.mjs           # report
node ../../scripts/exercise-bank/verify-videos.mjs --strict  # exit 1 on problems
```

Link rot is silent: a clip that goes private leaves an athlete staring at a
dead player with no error raised anywhere. This re-checks every video against
YouTube's oEmbed endpoint — still public, still the same channel, still a
title consistent with the exercise — and names anything that drifted.

Edit the JSON **or** the workbook, never both. Multi-value cells are
pipe-delimited (` | `), not comma-delimited, because the values contain
commas themselves.

## The audit is a gate, not a report

`audit.mjs` exits non-zero on anything that would make the swap engine
unsafe or incoherent. The rule that matters most: **a substitute offered for
an injury must not raise load on the tissue it is offered to protect.** That
check has rejected six hand-written edges so far.

## Before an athlete uses this

Swap edges with reason `lumbar`, `knee`, `achilles`, `shoulder` or `elbow`
are the most valuable part of the bank and the only part that could hurt
someone. The audit proves an edge is internally coherent; it cannot prove it
is clinically sound. Those need a qualified sign-off, tracked per block in
each file's `clinical_signoff` field (currently `null` everywhere).

Records whose annotation rests on inference rather than a source, or which
share a demonstration video, carry a `flags` entry. Nine do today.
