#!/usr/bin/env node
// Groundtruth status-line badge — the always-on, per-turn signal that the verifier RAN and what it
// said, so the user is never blind to it. Wired via settings.json "statusLine"; Claude Code passes
// session info as JSON on stdin. Reads the latest verdict card and prints a compact colored badge:
//   ○ GT (wired, no verdict yet) · 🟢 GT (clean) · 🟡 GT·N (warn) · 🔴 GT (block) · ⏳ GT (in progress)
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

let inp = {};
try { inp = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* no stdin */ }
const cwd = inp.cwd || inp.workspace?.current_dir || process.cwd();
const sid = inp.session_id || '';
const dir = join(cwd, '.claude', 'groundtruth');

function latestCard() {
  const direct = join(dir, sid + '.md');
  if (sid && existsSync(direct)) return direct;          // this session's card preferred
  try {
    const md = readdirSync(dir).filter(f => f.endsWith('.md'));
    if (!md.length) return null;
    return join(dir, md.map(f => [f, statSync(join(dir, f)).mtimeMs]).sort((a, b) => b[1] - a[1])[0][0]);
  } catch { return null; }
}

const C = { grey: '\x1b[38;5;245m', green: '\x1b[38;5;108m', amber: '\x1b[38;5;180m', red: '\x1b[38;5;203m', off: '\x1b[0m' };
const out = (s) => { process.stdout.write(s + C.off); };

const card = latestCard();
if (!card) { out(C.grey + '○ GT'); process.exit(0); }     // installed + wired, hasn't run yet

let verdict = '';
try { verdict = (readFileSync(card, 'utf8').match(/VERDICT\s+[^\n]+/) || [''])[0]; } catch { /* unreadable */ }

if (/🔴/.test(verdict)) out(C.red + '🔴 GT');
else if (/⏳/.test(verdict)) out(C.amber + '⏳ GT');
else if (/🟡/.test(verdict)) { const n = (verdict.match(/(\d+)\s+finding/) || [])[1]; out(C.amber + '🟡 GT' + (n ? '·' + n : '')); }
else out(C.green + '🟢 GT');   // deterministic verdict clean
