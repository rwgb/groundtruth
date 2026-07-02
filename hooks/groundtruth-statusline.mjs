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

// Stale-install nudge: `marketplace update` downloads a newer version INTO the cache but does NOT move the
// installed pin (installed_plugins.json), and a restart faithfully reloads the OLD pin — so the verdict hook
// keeps running a stale engine that emits already-fixed false positives, silently. This statusline runs the
// NEWEST cached version (the .sh wrapper resolves it), so it's the one surface that can SEE the skew even
// while the hook is pinned old. If newest-cached > installed, suffix `⬆<newest>` so the drift is visible.
const cmpVer = (a, b) => { const p = s => String(s).split('.').map(Number);
  const x = p(a), y = p(b); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
function staleInstallTail() {
  try {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const base = join(home, '.claude', 'plugins', 'cache', 'groundtruth', 'groundtruth');
    const newest = readdirSync(base).filter(d => existsSync(join(base, d, 'hooks', 'groundtruth.mjs'))).sort(cmpVer).pop();
    const reg = JSON.parse(readFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf8'));
    const inst = reg.plugins?.['groundtruth@groundtruth']?.[0]?.version;
    if (newest && inst && cmpVer(newest, inst) > 0) return C.off + C.red + ' ⬆' + newest;  // update cached but not pinned → restart+/plugin update
  } catch { /* no registry / cache → no nudge */ }
  return '';
}
const tail = staleInstallTail();

const card = latestCard();
if (!card) { out(C.grey + '○ GT' + tail); process.exit(0); }     // installed + wired, hasn't run yet

let verdict = '';
try { verdict = (readFileSync(card, 'utf8').match(/VERDICT\s+[^\n]+/) || [''])[0]; } catch { /* unreadable */ }

if (/🔴/.test(verdict)) out(C.red + '🔴 GT' + tail);
else if (/⏳/.test(verdict)) out(C.amber + '⏳ GT' + tail);
else if (/🟡/.test(verdict)) { const n = (verdict.match(/(\d+)\s+finding/) || [])[1]; out(C.amber + '🟡 GT' + (n ? '·' + n : '') + tail); }
else out(C.green + '🟢 GT' + tail);   // deterministic verdict clean
