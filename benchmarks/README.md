# Benchmarks — measure Groundtruth's precision, honestly

A verifier is only worth trusting if it publishes its own miss rate. This directory holds the two measurements — one you can reproduce **now** from frozen data, one you run on **your own** repo over a week — and refuses to fabricate the headline number before the data exists.

## 1. Captured precision (reproducible now)

The precision work was driven by real data: every finding Groundtruth emitted across **15 of its own recent sessions** (auditing itself), hand-labeled FP / TP / borderline and frozen in [`../hooks/corpus.fixture.json`](../hooks/corpus.fixture.json).

```bash
node corpus-precision.mjs
```

Prints the FP/TP breakdown by label and bucket, and the false-positive rate **at capture** (majority FP — the number the v0.8.0 precision work set out to cut). Every FP on the corpus carries the phase that fixed it; the fix + regression test is in [`../FIXES.md`](../FIXES.md).

**Dogfood after the fixes** (reproduce with `node ../hooks/groundtruth.mjs --audit` from the repo root): self-match false positives in the engine source went to **0** (`Class 2`) and phantom-import FPs **3 → 0** (`Class 4`); self-checks **242 → 393**, red-team **14/14**.

## 2. Live false-positive rate on your repo (the pending headline)

The honest headline — *"across a week of real sessions, Groundtruth's false-positive rate is X%"* — has to be measured on real sessions, not asserted. Groundtruth writes an append-only, one-line-per-turn log at `.claude/groundtruth/history.jsonl`; this harvester reads it:

```bash
# run it in warn mode for a week (the default), then:
node gt-harvest.mjs ~/your-repo --days 7
# or point at a parent folder to sweep every repo at once
```

It prints a summary (turns seen, % with findings, verdicts, findings by class) and writes **`gt-week.csv`** — one row per finding with a blank `false_positive?` column. Fill that column honestly, and:

```
precision = (finding rows − false positives) / turns
```

That number — published with its misses, not just its wins — is the one worth publishing. It is **not** in this README yet, on purpose: the instrument shipped in v0.9.0, so the first honest week of v0.9.0 data doesn't exist until a week after you install it. Publishing it early would be the exact overclaimed "done" Groundtruth exists to catch.

## Method notes

- **Warn mode** (the default) so nothing is blocked while you collect — you're measuring the auditor, not gating work.
- **Label FP conservatively:** a finding is a false positive only if a fair reader would call it wrong, not merely annoying. Borderline → not FP.
- **The append-log is required for a real count.** Without it the harvester falls back to per-session snapshots, which overwrite each turn and undercount — it warns you when that happens.
