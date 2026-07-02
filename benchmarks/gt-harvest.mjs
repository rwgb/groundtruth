#!/usr/bin/env node
// gt-harvest.mjs — collect a week (or all) of Groundtruth findings into a summary + CSV, so you can measure
// Groundtruth's false-positive rate on YOUR OWN repo. Deterministic, no network.
//
//   node gt-harvest.mjs [rootDir] [--days N]
//
// Reads every .claude/groundtruth/history.jsonl under rootDir (recursive) — the append-only, one-line-per-turn
// log Groundtruth writes each Stop. Falls back to the per-session *.findings.json snapshots (which UNDERCOUNT,
// and it warns you) if no history log exists yet. Writes gt-week.csv with one row per finding + a blank
// `false_positive?` column: fill it honestly, and your headline number is (findings − false positives) / turns.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : process.cwd();
const di = process.argv.indexOf('--days');
const days = di > -1 ? Number(process.argv[di + 1]) : 7;
const since = Date.now() - days * 864e5;

function walk(dir, hits = []) {
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return hits; }
  for (const e of ents) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, hits);
    else if (e.name === 'history.jsonl') hits.push({ type: 'log', p });
    else if (e.name.endsWith('.findings.json')) hits.push({ type: 'snap', p });
  }
  return hits;
}

const files = walk(root);
const logs = files.filter((f) => f.type === 'log');
const snaps = files.filter((f) => f.type === 'snap');
const recs = [];

if (logs.length) {
  for (const { p } of logs) for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (Date.parse(r.ts) >= since) recs.push(r); } catch {}
  }
} else {
  // fallback: one snapshot per session (undercounts — no per-turn history)
  for (const { p } of snaps) {
    try {
      const st = statSync(p);
      if (st.mtimeMs < since) continue;
      const f = JSON.parse(readFileSync(p, 'utf8'));
      recs.push({ ts: new Date(st.mtimeMs).toISOString(), session: p.split('/').pop().replace('.findings.json', ''),
        verdict: f.some((x) => x.sev === 'block') ? 'block' : f.length ? 'warn' : 'clean', findings: f, _snap: true });
    } catch {}
  }
}

const turns = recs.length;
const withF = recs.filter((r) => (r.findings || []).length).length;
const byVerdict = {}, byClass = {};
const rows = [['ts', 'session', 'verdict', 'class', 'sev', 'msg', 'false_positive?']];
for (const r of recs) {
  byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1;
  for (const f of r.findings || []) {
    byClass[f.cls] = (byClass[f.cls] || 0) + 1;
    rows.push([r.ts, r.session, r.verdict, f.cls, f.sev, (f.msg || '').replace(/[\n"]/g, ' '), '']);
  }
}
const csv = rows.map((r) => r.map((c) => (/[",]/.test(String(c)) ? `"${c}"` : c)).join(',')).join('\n');
writeFileSync('gt-week.csv', csv);

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nGROUNDTRUTH — ${days}-day harvest  (source: ${logs.length ? 'history.jsonl' : 'per-session snapshots — UNDERCOUNTS, add the append-log'})`);
console.log(`  turns/sessions seen : ${turns}`);
console.log(`  with ≥1 finding     : ${withF}  (${turns ? Math.round((100 * withF) / turns) : 0}%)`);
console.log(`  verdicts            : ${Object.entries(byVerdict).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}`);
console.log(`  findings by class   :`);
Object.entries(byClass).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`     ${pad(k, 22)} ${v}`));
console.log(`\n  → gt-week.csv written (${rows.length - 1} finding rows). Fill the false_positive? column,`);
console.log(`    then the real precision = (rows − false positives) / turns.\n`);
