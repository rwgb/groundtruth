#!/usr/bin/env node
// corpus-precision.mjs — the reproducible "captured precision" number, from the FROZEN labeled corpus.
// Reads ../hooks/corpus.fixture.json: 22 real findings Groundtruth emitted across 14 of its OWN recent
// sessions, hand-labeled FP/TP/BORDERLINE/CAVEAT. This is the pre-v0.8.0 baseline the precision work targeted;
// every FP maps to a fix + regression test in FIXES.md. Deterministic, no network. Run: node corpus-precision.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(here, '..', 'hooks', 'corpus.fixture.json'), 'utf8'));
const f = corpus.findings;
const tally = (k) => f.reduce((m, x) => ((m[x[k]] = (m[x[k]] || 0) + 1), m), {});
const sessions = new Set(f.map((x) => x.session)).size;
const fp = f.filter((x) => x.label === 'FP').length;

console.log(`\nGroundtruth — captured precision (frozen corpus)`);
console.log(`  ${f.length} findings · ${sessions} sessions with a finding (of 14 audited; Groundtruth on itself, pre-v0.8.0)\n`);
console.log(`  by label :`, tally('label'));
console.log(`  by bucket:`, tally('bucket'));
console.log(`\n  false-positive rate at capture: ${fp}/${f.length} = ${Math.round((100 * fp) / f.length)}%`);
console.log(`  (majority FP — the number the v0.8.0 precision work set out to cut.)`);
console.log(`\n  Every FP carries its fixing phase on the corpus entry; the fix + regression test is in FIXES.md.`);
console.log(`  The LIVE post-v0.8.0 rate on real sessions is measured by gt-harvest.mjs — see benchmarks/README.md.\n`);
