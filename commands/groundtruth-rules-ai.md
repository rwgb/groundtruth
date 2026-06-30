---
description: "Opt-in (NOT default): fan out an agent to read your rule docs and PROPOSE richer Groundtruth rules beyond the literal `X` not `Y` forms. Routed through the same grounding + /groundtruth-rules approval gate — nothing arms, and the model runs only when you invoke this."
argument-hint: "(optional) a doc/dir to focus on; default = all rule docs"
---

# Groundtruth — AI rule extraction (opt-in; not on by default)

Groundtruth's default rule compiler is **deterministic** — it only pulls the literal backtick forms
(`` `X` not `Y` ``, `` never `X` ``) from your docs, with **no model**. This command adds an **opt-in** model
pass: fan out an agent to read your rule docs in *prose* and propose the deterministic rules the literal
extractor missed — then route them through the EXACT SAME safety pipeline (grounding + the
`/groundtruth-rules` human approval gate). **Nothing here arms a rule, and the model never runs unless you
invoke this command.**

## Do this

1. **Fan out the reading.** Use the Task tool to spawn subagent(s) — the `Explore` agent is ideal — to read
   this repo's rule docs: `CLAUDE.md`, `AGENTS.md`, `SCHEMA.md`, `ARCHITECTURE.md`, `docs/*.md`, every
   `**/.claude/skills/**/SKILL.md`, every `**/.claude/agents/*.md`, `.cursorrules`, `.windsurfrules`
   (whichever exist). If there are many docs, fan out one subagent per doc group and run them in parallel.
   If `$ARGUMENTS` names a path, focus there. Ask each subagent to return candidate rules **only** in this
   exact shape:
   ```json
   { "id": "no-<slug>", "kind": "forbid_in_added", "file_re": "<regex>", "line_re": "<regex>", "message": "<the rule, one line>" }
   ```
   - `file_re` — which files the rule applies to (`\\.sql$`, `\\.(ts|tsx)$`, …); a broad source set if unsure.
   - `line_re` — the forbidden token/pattern; anchor identifiers with `\\b`.

2. **Be conservative — this is the whole point.** Propose ONLY rules a regex can actually enforce: a
   forbidden token/string appearing in newly-added code. **Drop** anything needing judgment, semantics, or
   context ("write clean code", "validate input properly", "use good names") — a regex can't enforce those.
   **Drop** anything the literal extractor already gets. When in doubt, DROP it: a missed rule costs nothing;
   a noisy or over-broad rule wastes the human's review and trains them to ignore the gate.

3. **Write to the per-project seed file** (the plugin's existing rule input — grounded and gated identically
   to the deterministic rules): merge your candidates into `.claude/groundtruth/seed-rules.json` (a JSON
   array — create it if absent; **never overwrite** existing entries; dedupe by `id`).

4. **Ground them deterministically.** Run the plugin's grounder so each candidate is checked against the
   real tree:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/hooks/compile-rules.mjs" .
   ```
   (If `${CLAUDE_PLUGIN_ROOT}` is unset, locate it:
   `node "$(find ~/.claude/plugins -name compile-rules.mjs -path '*groundtruth*' | head -1)" .`)
   This writes `.claude/groundtruth/proposed-rules.json`, marking each candidate **`armable`** (matches zero
   committed code → can only fire on new code, safe) or **`review`** (already matches code → over-broad, or
   a real existing hit worth a human's eye).

5. **Hand off to the gate.** Tell the user, concisely: how many rules you proposed, how many grounded
   **clean** vs **need-review**, and that **nothing is enforced**. To review and arm them, they run
   **`/groundtruth-rules`** — spell that command out verbatim.

## Hard rules (do not break)
- **Only** write `.claude/groundtruth/seed-rules.json`. **Never** touch `compiled-rules.json` (the armed
  set) — arming is the human's job via `/groundtruth-rules`.
- **Only** propose rules expressible as a literal `line_re` regex. Deterministic-enforceable or not at all.
- This command is **opt-in and not default**: it runs only when explicitly invoked. Groundtruth's per-turn
  audit stays fully deterministic and offline; this changes nothing about that.
