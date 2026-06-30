# Groundtruth

**Audits whether an agent actually did what it was asked — and catches the false "Done."**

A coding agent reports success. Groundtruth reads the *same* turn from the outside — the request, what
the agent claimed, the actual `git diff`, and your project's standing rules — and renders a one-screen
verdict before the turn is allowed to end.

Failures sort into three buckets by cause:

| Bucket | What happened | How Groundtruth catches it |
|---|---|---|
| **Told & Done** ✓ | instruction satisfied | nothing to do |
| **Told & Missed** ⚠ | part of the task was silently dropped | completeness check: every named subtask must map to a real change |
| **Told & Ignored** ✗ | a rule that was *in context* got overridden anyway | independent rule-compliance audit, with no stake in the work |

The third is the one nothing else catches: not forgetting, but *rationalising past* a rule the agent
could see. Groundtruth catches it because the auditor never did the work, so it never inherits the framing
("this is just a small addition") that let the rule slip.

## Design principle — remove the cheap wrong path

This is the generator behind every check in here. When something fails, **don't ask "why didn't it do the
right thing"** — that has no actionable answer. Ask instead:

1. **What assumption did it exploit?** (e.g. `git grep -E` ignoring `\b`; a `user`-role turn being a real ask; a writable `tasks.json` status)
2. **Why was that cheaper than verification?** (a 0-hit looks like "absent"; a deferral silently downgrades a block to a warn that's invisible in VS Code)
3. **How do we make the correct path cheaper than the wrong one?** — not just *visible*, **costly**: keep the loud signal exactly where the dodge happens.
4. **Leave a regression so the shortcut can't silently return.**

Two invariants hold every change to this standard:

> Every fix removes one cheap wrong path from the system.
>
> Every fix leaves behind a permanent invariant or regression test — otherwise you've only postponed the next failure.

A fix that only makes the wrong thing *visible* (not *costly*) is a half-fix; in an environment where warnings
are silent, "downgrade to warn" still pays the agent. The check must price the dodge, not just narrate it.

### Trust model — the verdict is only as trustworthy as the least-protected input it reads

The deepest attack isn't gaming a check — it's editing **what the check reads**. And the honest, hard truth
that three red-team passes drove home: **Groundtruth runs in the same trust domain as the agent it audits.**
The hook reads from the same filesystem the agent writes and the same environment its shell can `printenv`.
So *no on-disk artifact* the hook creates — not `config.json`, not `compiled-rules.json`, not the integrity
snapshot — is a real security boundary; an adversarial agent can rewrite or delete any of them. Each time we
"sealed" a disk sensor, the next pass stepped around the seal (forge the snapshot, NUL-byte the file, wrap the
predicate). The fix is not a better seal. It's to **anchor on the inputs the agent cannot author**, and to be
honest about the line between *evidence* and *prevention*.

**The two unforgeable anchors** (everything trustworthy is built on these):
- **The transcript** — the harness's own record of what the agent did (tool calls, Bash command text, results).
  The agent can't author its own recorded actions. So a Write/Edit to a referee file is detected from the
  *transcript* ledger (its changed path), excused only if the matching `/groundtruth-*` slash-command — a user
  turn the agent can't forge — ratifies it.
- **The git-computed diff** of the real working tree (incl. untracked content), which the agent can't fake
  short of not-writing-the-code. The Bash/MCP write channel (a referee file changed with no Write/Edit call)
  is caught by a SessionStart content-hash **snapshot** comparison — the write EFFECT, read precisely, rather
  than a substring scan of the command stream (which re-fired on stale commands, and is no longer used).

**Evidence, not prevention — and scope the evidence too.** Against an adversarial agent with shell access,
Groundtruth is at best **tamper-evident, not tamper-proof**: it cannot *prevent* a determined agent in its own
trust domain. But the evidence is **not complete** either, and the honest scope matters: the transcript is an
unforgeable *input*, but the sensor reading it (a `.claude/groundtruth/` substring + a write-verb) is still an
in-domain *classifier* — so it catches a **direct** write (`printf > .claude/groundtruth/config.json`) but
**not a laundered one**. Route the same effect through a one-line helper (`node launder.mjs …` that flips
`config.json` *and* re-forges the snapshot in the same breath) and the command sits in the transcript verbatim,
**recorded but unrecognised** → a clean green over a disabled block. The hash snapshot — the supposed catch for
"an effect laundered through a helper" — also misses it, because the helper re-forged the snapshot. So:

| Config | Direct referee write | Laundered (helper re-forges snapshot) |
|---|---|---|
| **default** (no key) | ⚠ surfaced | 🟢 **evades — recorded, not surfaced** |
| key set, shell-readable | ⚠ surfaced | 🟢 evades (helper `printenv`s the key, signs a valid forgery) |
| **key set + held out of the shell's env** | ⚠ surfaced | ⚠ surfaced (helper can't sign → unsigned forgery is rejected) |

In short: **in-session tamper-evidence is reliable only with `GROUNDTRUTH_KEY` set AND held outside the agent's
tool environment.** In the default config a determined agent can keep its tamper out of the *verdict*, not just
out of the block. The disk snapshot + signature are kept as defense-in-depth (they raise the cost and catch the
naive cases), never trusted as state — but chasing the laundered case with more in-session pattern-matching is
the cat-and-mouse this design retired three passes ago. The deterministic answer is the next paragraph.

**To upgrade evidence → prevention, the platform must** (these are deployment requirements, not things the
hook can self-enforce): (1) hold `GROUNDTRUTH_BLOCK` / `GROUNDTRUTH_KEY` in an environment the agent's **Bash
tool cannot read** (otherwise `printenv` forges a valid signature); (2) keep the **transcript unwritable** by
the agent; ideally (3) run the hook in a **separate trust domain** (a pre-merge CI gate, not an in-session
hook). Under those, the env-anchored block is un-disablable and the transcript anchor is solid.

**Recommendation for security-critical use:** set `GROUNDTRUTH_BLOCK=1` and `GROUNDTRUTH_KEY=<random>` in an
environment your agent's shell can't read, and treat the in-session hook as the *evidence* layer with a
**CI/pre-merge run as the prevention layer**. `/groundtruth-block` (writing `config.json`) is convenience for
non-adversarial use only.

## Install

Groundtruth is a Claude Code plugin. Add this repo as a marketplace, then install it — from inside Claude Code:

```
/plugin marketplace add akahkhanna/groundtruth
/plugin install groundtruth@groundtruth
```

Restart Claude Code so the hooks load. No API key and no network calls — the Tier-1 engine runs locally and deterministically (no LLM at runtime).

Prefer to try it without installing? Point Claude Code at a local checkout:

```bash
git clone https://github.com/akahkhanna/groundtruth
claude --plugin-dir ./groundtruth
```

Requires: Claude Code, `node` ≥18, and a git repo (reality = `git diff HEAD`).

## Setup — what you configure once

`/plugin install` enables the hooks (it writes `enabledPlugins` for you). Then run **`/groundtruth-setup`** —
a one-shot check that detects what's configured and hands you the exact action for anything missing (a plugin
can't set the main `statusLine` or env vars itself, so those are guided, not automatic). The steps it walks:

**1. Approve the rules from your docs (the core step — a permission gate, not automatic).** On session
start, Groundtruth reads your rule docs — `CLAUDE.md`, `SCHEMA.md`, `**/ARCHITECTURE.md`, `docs/*.md`, every
`.claude/skills/**/SKILL.md`, every `.claude/agents/*.md`, `.cursorrules`/`.windsurfrules` — and **proposes**
deterministic rules into `.claude/groundtruth/proposed-rules.json`. **Nothing is enforced until you approve
it.** Run:
```
/groundtruth-rules            # show what was proposed; ask which to arm
/groundtruth-rules approve-all # arm every CLEAN candidate (0 existing code hits)
```
It separates **clean** candidates (match zero committed code → can only fire on new code) from ones that
**need review** (already match code → either a real existing bug or an over-broad rule that would false-fire,
e.g. a doc says ``avoid `map` `` but `.map(` is everywhere). Only clean rules are offered for one-shot
approval; review ones you arm by name after looking. Approved rules land in `compiled-rules.json` (the active
set) at **warn**; promote one to **block** by setting its `severity`. Re-run after editing your docs to
approve the delta. (The verdict card shows a one-line nudge whenever clean rules await approval.)

Two more things the plugin **cannot** set on its own — Claude Code only lets a plugin ship
`subagentStatusLine`, not the main `statusLine`, and a plugin can't inject env vars — so set them once:

**2. Block mode (opt-in; default is warn) — no settings file needed:**
```
/groundtruth-block on        # writes .claude/groundtruth/config.json {"block": true}; /groundtruth-block off to revert
```
(Equivalently, set `GROUNDTRUTH_BLOCK=1` in your settings `env` — both are read; if neither, it stays warn.)

**3. Status badge (recommended) — the one manual settings line.** Add to `.claude/settings.local.json`,
pointing at the installed plugin's script (the main status bar isn't plugin-settable):
```json
"statusLine": {
  "type": "command",
  "command": "node \"/absolute/path/to/groundtruth/hooks/groundtruth-statusline.mjs\""
}
```
It shows, every turn: `○ GT` (ran, no verdict yet) · `🟢 GT` (clean) · `🟡 GT·N` (N warnings) · `🔴 GT`
(block) · `⏳ GT` (in progress) — the always-on "it ran, here's the verdict" signal. Without it, verdicts
still write to `.claude/groundtruth/<session>.md` and `/groundtruth` prints the latest; you just lose the
passive indicator. (Note: in the VS Code extension the verdict card itself doesn't render inline — only a
*block* surfaces there — so the badge is how you see warn/clean verdicts; the terminal CLI shows the full card.)

## Two modes

- **Audit** (proactive, on demand) — scan the whole repo for the debt agents leave behind and print
  an inventory: `node hooks/groundtruth.mjs --audit`. No task, no rules → *findings, not a verdict*
  (classes 2 stub/placeholder + 4 phantom ref). The cheapest way to see Groundtruth work on your code.
- **Verify** (reactive, at `Stop`) — the full per-turn audit below.

## How it works (Verify)

One deterministic `Stop` hook (`hooks/groundtruth.mjs`) — **no LLM, no network, always runs, ~free**. It
reads the claim from the Stop payload, intent + Bash evidence from the transcript, and reality from
`git diff HEAD`, then checks:

- **Honesty** — 1 false test/build claim ("tests pass" with no test run, or a failing run) · 2 stub/
  placeholder (`TODO`/`FIXME`/`NotImplemented`/`pass`/Rust `todo!()`/Go `panic("…")`/…) · 3 silent no-op
  (claimed a change to a file absent from the diff) · 4 phantom ref (a new relative import whose target
  doesn't exist) · 9 special-casing (non-test code that branches on test/CI/the auditor).
- **Completeness** (scope-miss) — a named deliverable in the ask that never lands in the diff (the
  open-loop / task ledger; name-matching, deliberately crude — it abstains when the ask names nothing).
- **Rules** (directive-override — *the differentiator*) — your project's standing rules, **compiled from
  your own docs into deterministic predicates** and enforced. No LLM: the doc literally says
  ``use `X` not `Y` `` or ``never `Z` ``, so a violation is a regex match, not a judgment call.
- **Security** — hardcoded secrets, an RLS-off new table / anon-readable policy (Postgres/Supabase), a
  committed `.env`.

A **semantic layer** — richer ask↔delivery matching, spec-substitution, regression detection, and judging
when an agent *rationalised past* a rule rather than literally breaking it — is on the roadmap; **it needs
an LLM and is not shipped.** The plugin makes no model calls and needs no API key.

**Rules it reads** (auto-discovered, repo-agnostic): `CLAUDE.md`, `AGENTS.md`, `**/SCHEMA.md`,
`**/ARCHITECTURE.md`, `docs/*.md`, `**/.claude/skills/**/SKILL.md`, `**/.claude/agents/*.md`,
`.cursorrules`, `.windsurfrules`. From these it extracts two prose forms the author already marked as
code — corrective pairs (``use `X` not `Y` `` / ``use `X` (not `Y`)``) and explicit forbids
(``never `X```) — grounds each against the tree, and **proposes** (never auto-arms) them for you to
approve via `/groundtruth-rules`. Extraction stays deliberately narrow + literal; the permission gate, not
a smarter parser, is what makes it safe to read every doc.

**Nothing project-specific ships in the plugin** — it derives rules only from *your* repo's docs. For a
file-scoped rule a sentence can't express (e.g. "no `import.meta` under `api/_lib/`" — the directory scope
isn't in any doc line), drop a JSON array of rule objects at `.claude/groundtruth/seed-rules.json` in your
repo; they're merged in and grounded through the same gate. Shape: `{ id, kind: "forbid_in_added", file_re,
line_re, message }`.

**Optional — model-assisted rule extraction (opt-in, off by default).** `/groundtruth-rules-ai` fans out an
agent to read your docs in *prose* and propose the regex-enforceable rules the literal extractor missed. It
writes only to `seed-rules.json` and runs through the **same grounding + `/groundtruth-rules` approval gate**
— nothing arms, and the model runs only when you invoke it. This is the one place a model ever touches
Groundtruth, and only on demand; the per-turn audit stays fully deterministic and offline.

## Verdict card

Written to `.claude/groundtruth/<session>.md` each turn:

```
GROUNDTRUTH · session 8f3a · task: "add retry/backoff to the upload client"
  ✗ [Class 7 · directive-override] new feature built inline in main.go
       rule: feature-architecture (CLAUDE.md) — expected its own retry package, not inline in main
       evidence: backoff loop added directly to uploadFile(); the rule says extract
  ⚠ [Class 5 · scope] the new --timeout flag isn't wired into the Config struct
  VERDICT: BLOCKED — extract to its own unit before stop.
```

## Languages

Mechanics, not syntax — most checks are language-general. The honest scope:

- **General across languages:** false-"tests pass" (recognizes Go/Rust/Ruby/Java/.NET/Python/JS runners),
  stub/placeholder (TODO/FIXME + Rust `todo!()`, Go `panic("…")`, Java/C# `NotImplementedException`, Kotlin
  `TODO()`), silent no-op (any named source file), scope/completeness, directive-override, compiled rules
  (scoped to the languages your repo actually uses), secrets, and env exposure.
- **JS/TS + Ruby only:** phantom relative-import resolution (Class 4) — it resolves by file existence, which
  is only unambiguous where imports are path-relative. Python/Go/Rust/Java/C# (package-qualified) **abstain**
  (emit nothing) rather than false-flag.
- **Postgres/Supabase only:** the B1/B3 RLS checks — they fire solely on added `.sql` lines and are a no-op
  everywhere else.

## Warn vs block

- **Default: WARN.** The verdict is recorded; the turn is never disrupted. Non-destructive — build
  trust first. (Stop-hook stdout is debug-log-only, so read the verdict from the `.claude/groundtruth/`
  file.)
- **Opt-in: BLOCK.** Run `/groundtruth-block on` (or set `GROUNDTRUTH_BLOCK=1`). A block-severity finding
  refuses the stop and feeds the specific gap back so the agent finishes it (retry cap → escalate, never wedges).

> **False positives are fatal.** Run in WARN until precision is proven on your real sessions, *then*
> flip block. Every verdict carries file/line evidence so a wrong call is auditable, not mysterious.

## Verify

```bash
node hooks/groundtruth.test.mjs   # 228 assert-based unit checks, no deps
node hooks/redteam.mjs            # LIVE adversarial harness (12 scenarios) — sandboxed, exits non-zero if a rail fell
```

The red-team harness is the *proven* (not asserted) counterpart: it spins up a throwaway git repo, hands the
real hook a transcript where a smart agent **actively neuters the rails** — disarms `compiled-rules.json`,
flips `config.json` to `{block:false}`, commits a fake AWS key, claims "0 pending, done" — and confirms
(A) the pre-commit halts the staged secret, (B) a *config-only* block is genuinely **defeated** by the agent's
own write (the exposure, demonstrated), and (C) an **env-anchored** block (`GROUNDTRUTH_BLOCK=1`) **holds** —
`decision:block`, citing the integrity-tamper findings and the secret — even with every rule disarmed. Blast
radius is contained: fake key, temp repo, auto-removed; it never touches a real repo or real history.

## Status

Built: Audit mode + per-turn verify-on-Stop, all **deterministic (no LLM)** — honesty classes 1–4 + 9,
completeness (scope-miss), directive-override via doc-compiled rules behind an approval gate, plus the
security checks. The semantic/LLM layer (spec-substitution, regression detection, semantic rule-judgment)
is roadmap, not shipped. See [ROADMAP.md](ROADMAP.md) for what's next (baseline diffing, pre-flight
intent check, the remediation loop + anti-gaming, doc-compiled rules, and the v2 dashboard).
