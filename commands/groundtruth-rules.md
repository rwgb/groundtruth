---
description: "Review the rules Groundtruth extracted from your docs and approve which to arm (the permission gate)."
argument-hint: "(optional)  list | approve-all | unarm <id …> | <rule-id …>"
---

Groundtruth's compiler reads your project's rule docs — `CLAUDE.md`, `SCHEMA.md`, `**/ARCHITECTURE.md`, `docs/*.md`, every `.claude/skills/**/SKILL.md`, every `.claude/agents/*.md`, `.cursorrules`/`.windsurfrules` — and **proposes** deterministic rules. Nothing is enforced until you approve it here. This command is that gate.

Argument: **$ARGUMENTS** — empty or `list` ⇒ just show the candidates; `approve-all` ⇒ arm every *clean* candidate; `unarm <id …>` ⇒ **remove** those rules from the active set (silence a rule that's firing wrongly — the verdict card prints each rule's `[id]` for exactly this); otherwise a space-separated list of rule ids to arm.

Do this:

1. Read `.claude/groundtruth/proposed-rules.json` (the candidates) and `.claude/groundtruth/compiled-rules.json` (already-approved/active — may not exist yet). If `proposed-rules.json` is missing, the compiler hasn't run: tell the user to start a fresh session (init re-proposes) or run `node "<plugin>/hooks/compile-rules.mjs" .` from the repo root, then stop.

2. Present the candidates, grouped — be concise, one line each:
   - **Already armed** (in compiled-rules.json): `id` · severity · message.
   - **Clean — safe to approve** (proposed, `status: "armable"`, not already armed): `id` · message · source. These match **zero** existing code lines, so arming them can only fire on *new* code — low risk.
   - **Needs review** (`status: "review"`): `id` · message · `hits` existing code matches · the `sample` line. **Warn the user**: a candidate that already matches committed code is either (a) catching a real existing problem, or (b) over-broad and will false-fire on legitimate code (e.g. a doc says ``avoid `map` `` but `.map(` is everywhere). Only arm one of these if you've read the sample and confirmed it's a real rule with the right scope.

3. Decide what to do based on the argument:
   - `approve-all` → arm all **clean** candidates only. Never auto-arm a review candidate — those need a human eye.
   - `unarm <id …>` → **remove** exactly those ids from `compiled-rules.json` (write back the array minus them; if a named id isn't armed, say so and skip it). This is the frictionless "silence a wrong rule" path — no doc edit, no restart. Confirm which were removed and that they stop firing next turn. Then STOP (don't fall through to the arm path).
   - a list of ids → arm exactly those (a review candidate is allowed only when explicitly named).
   - empty / `list` → show the table, write nothing, and end with a crystal-clear next action the user can copy verbatim — e.g.:
     > **To arm all N clean rules, reply with the whole line: `/groundtruth-rules approve-all`** — or just tell me "approve the clean rules" in plain words and I'll arm them. To pick specific ones: `/groundtruth-rules <id> <id>`. To skip for now: do nothing — nothing is enforced until you approve.
     Note for the user: a bare `approve-all` or rule id typed *on its own* gets read as a command name and fails with "unknown command" — type it as an argument on the same line as `/groundtruth-rules`, or just ask in plain language (this command runs as me, so I can arm them from a natural-language request too).

4. To arm: write `.claude/groundtruth/compiled-rules.json` as the union of (already-approved rules) + (newly approved candidates). For each rule keep only the runtime fields — `id`, `source`, `kind`, `file_re`, `line_re`, `severity`, `message`, and `unless_re` if present — and **drop** the proposal-only fields (`status`, `hits`, `sample`, `positive_example`, `reason`). Default `severity` to `"warn"`. **Preserve** the existing severity of any already-approved rule (never demote a human's `block` back to `warn`). Dedup by `id`. Write valid JSON (an array).

5. Confirm: "Armed N rule(s) at warn. Active next turn — the Stop hook re-reads compiled-rules.json each run; no restart. To make one halt the turn instead of warn, set its `severity` to `"block"` (or `/groundtruth-block on` for global block mode). After editing your docs, start a new session (init re-proposes) and re-run /groundtruth-rules to approve the delta."

Context to relay: **warn** = the violation shows in the verdict card/badge but never halts. **block** = it halts the stop with a corrective (retry cap → escalate, never wedges). Arm at warn first; promote to block once you trust the precision on your real sessions.
