---
description: "One-shot Groundtruth setup check — detects what's configured and hands you the exact actions for the rest."
---

You are running the Groundtruth setup check. Some things a Claude Code plugin **cannot set itself** — the main `statusLine` and any env var — so this command DETECTS the current state and gives the user the exact, copy-pasteable action for anything missing. Be concise: a 5-line checklist (✓ / ✗ + the one-line fix), then a one-line summary. The two things this command DOES execute — both only after the user says yes — are (a) arming clean rules **in warn** (item 1) and (b) the `settings.local.json` wiring (badge/env, the closing offer). Everything else you DETECT and hand back the fix; for `settings.local.json` edits SHOW the user the block to paste (it's their file). Never enable block mode or arm a `review`-status rule on your own.

First, resolve two paths you'll need:
- the **project root** = the cwd.
- the **plugin hooks dir**: find the newest `*/hooks/groundtruth-statusline.mjs` under `~/.claude/plugins/cache/groundtruth/groundtruth/` (use the highest version). Call it `<HOOKS>`. If you can't find it, fall back to telling the user to point at their groundtruth checkout's `hooks/`.

Then check each item and report `✓`/`✗`:

1. **Rules — arm the clean ones inline** (this command is the installer; don't punt to `/groundtruth-rules`). Read `.claude/groundtruth/proposed-rules.json` and `compiled-rules.json`. Count clean-proposed (`status:"armable"`, not already armed) vs any that `status:"review"` (already match committed code — over-broad risk).
   - If clean rules are unarmed → show the count and **ask before arming**: *"Found `N` clean rules extracted from your docs (they match zero existing code, so they can only fire on new code). Arm them **in warn** now? `[yes / review each / skip]`."* This is safe because arming in warn only adds a line to the verdict card — it never blocks — and each firing prints its `[id]` so you can `/groundtruth-rules unarm <id>` in one step. Warn ≠ enforce; block stays a separate, deliberate step (item 3).
     - **yes** → arm exactly the clean candidates: write `.claude/groundtruth/compiled-rules.json` as the union of already-approved + newly-approved, keeping only runtime fields (`id, source, kind, file_re, line_re, severity, message`, `unless_re` if present), `severity` defaulting to `"warn"`, preserving any existing rule's severity, deduped by `id`. (This write is legitimate — `/groundtruth-setup` is a ratified writer of compiled-rules.json, same as `/groundtruth-rules`.) Confirm: *"Armed N rules at warn — active next turn."*
     - **review each** → hand off to `/groundtruth-rules` (the ledger) for a rule-by-rule look; arm nothing here.
     - **skip** → arm nothing; note it stays available via `/groundtruth-rules approve-all` later.
   - Never arm a `status:"review"` candidate here — those match existing code and need a human eye in `/groundtruth-rules`. Surface their count as a heads-up.
   - If `proposed-rules.json` is missing, init hasn't run: say "start a fresh session, or run `node \"<HOOKS>/compile-rules.mjs\" .`".
   - **Tip — richer rules from prose (opt-in, model-assisted): surface this as TEXT, never run it here.** The deterministic extractor only catches rules written in the literal ``use `X` not `Y` `` / ``never `X` `` forms. So *when the repo has a lot of prose rule-docs* — several `CLAUDE.md` / `SCHEMA.md` / `**/*.md` where rules are written as sentences — and the deterministic pass came back with few/no candidates, show a one-line pointer:
     > *"Found `N` literal rules across `M` rule-docs. `/groundtruth-rules-ai` fans out an agent to read those docs in **prose** and propose the regex-enforceable rules the literal pass missed. Heads-up: it's the **one** place Groundtruth spawns agents / uses an LLM — and only to **propose** rules (routed through the same grounding + approval gate; nothing arms until you approve). Nothing after that touches a model: every per-turn audit stays fully deterministic and offline. Opt-in, off by default — run it when your rules live in prose."*
     Judge "a lot of docs" from the rule-source files present (`CLAUDE.md`, `AGENTS.md`, `**/SCHEMA.md`, `**/ARCHITECTURE.md`, `docs/*.md`, skills/agent files); if the repo is thin on docs, skip the tip (it wouldn't help). Only ever *mention* `/groundtruth-rules-ai` — never invoke it from setup.

2. **Status badge** (recommended — in the VS Code extension, warn/clean verdicts only show via the badge). Read `.claude/settings.local.json` (and `settings.json`) for a `statusLine` key.
   - **Deploy the version-agnostic wrapper first** (do NOT pin the version dir — a path like `.../groundtruth/0.8.0/hooks/...` silently breaks the badge on the next plugin update). Copy the shipped wrapper to a STABLE path and make it executable:
     ```bash
     cp "<HOOKS>/groundtruth-statusline.sh" "$HOME/.claude/groundtruth-statusline.sh" && chmod +x "$HOME/.claude/groundtruth-statusline.sh"
     ```
     (The wrapper resolves the newest installed version at runtime, so the badge survives every update. It fails open — no install / no node → prints nothing.)
   - ✗ if `statusLine` is absent → give the EXACT block to paste into `.claude/settings.local.json`, with the user's real absolute home path filled in (Claude Code does not reliably expand `~`/`$HOME` in this command):
     ```json
     "statusLine": { "type": "command", "command": "bash \"/absolute/home/.claude/groundtruth-statusline.sh\"" }
     ```
     Note: only ONE statusLine can exist — if they already use one, this replaces it. If an OLD version-pinned `…/<version>/hooks/groundtruth-statusline.mjs` statusLine is already present, replace it with this wrapper form.

3. **Block mode** (default = warn, which is correct until you trust precision). Run `printenv GROUNDTRUTH_BLOCK` to detect the env anchor; also check `.claude/groundtruth/config.json` for `{block:true}`.
   - Report the live mode. To enable: **`/groundtruth-block on`** (convenience, agent-writable) OR add `"env": { "GROUNDTRUTH_BLOCK": "1" }` to `.claude/settings.local.json` (the **un-disablable** anchor — recommended for enforcement). Keep warn until you've watched it run clean on your real sessions; false positives are disruptive in block mode.

4. **Integrity key** (optional, security-critical only). Run `printenv GROUNDTRUTH_KEY` to detect.
   - If unset, say: "Optional — `GROUNDTRUTH_KEY=<random>` in `settings.local.json` env signs the integrity snapshot. Be honest about scope: **in-session it's best-effort** (the agent's shell can read the key), so it only raises the bar. **Real tamper-prevention is a CI/pre-merge gate**, not the in-session hook. Generate one with `node -e \"console.log(require('crypto').randomBytes(24).toString('hex'))\"`. Don't reuse a real credential."
   - Remind: env vars belong in `settings.local.json` (or the shell `claude` was launched from) — a project `.env` is the app's, NOT read by the hook. And `settings.local.json` should be gitignored (it holds the key); if it's tracked, `git rm --cached .claude/settings.local.json`.

5. **Pre-commit scan** (optional — the safety net for code an agent didn't author: a paste from a Claude *chat*, a hand-edit). The Stop hook only fires when Claude Code drives the edit; the git pre-commit hook fires on every `git commit` regardless, so it's the one place a manual paste gets checked. Check for a `.git/hooks/pre-commit` containing `groundtruth-pre-commit`.
   - ✗ if absent → **"run `node \"<HOOKS>/groundtruth.mjs\" --install-pre-commit` — scans the STAGED diff on every commit (secrets · RLS · stubs · dropped-symbol dangling refs). It's fail-open (never blocks on its own breakage), won't clobber a non-Groundtruth hook, and `git commit --no-verify` bypasses once. Re-run it after a plugin update if the path moves."**
   - If a foreign `pre-commit` already exists, `--install-pre-commit` refuses and prints the one line to add manually.

End with one summary line, e.g.: `Setup → rules: N clean unarmed (arm in warn?) · badge: ✗ · block: warn (on = enforce) · key: off (CI = real enforcement) · pre-commit: ✗ install.` (after arming: `rules: armed N (warn)`).

Then **offer to do the `settings.local.json` parts yourself** (the user asked for this): *"Want me to set up `settings.local.json` now — generate a random key, add the status badge + `GROUNDTRUTH_BLOCK=1`, and make sure the file is gitignored?"* If they say yes:
1. Generate a key: ``node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`` — capture the output; do NOT invent one.
2. Deploy the status-line wrapper (`cp "<HOOKS>/groundtruth-statusline.sh" "$HOME/.claude/groundtruth-statusline.sh" && chmod +x` it). Then read `.claude/settings.local.json` (create `{}` if absent), and **merge** (preserve existing keys): add `env.GROUNDTRUTH_BLOCK = "1"` (only if the user wants block — default to leaving it as warn and ask), `env.GROUNDTRUTH_KEY = <generated>`, and the `statusLine` block pointing at the wrapper with the user's real absolute home path filled in (`bash "/abs/home/.claude/groundtruth-statusline.sh"`). If an old version-pinned statusLine exists, replace it. Write valid JSON.
3. If `.claude/settings.local.json` is git-tracked (`git ls-files --error-unmatch` succeeds), run `git rm --cached .claude/settings.local.json` so the key never gets committed, and confirm it matches a `.gitignore` rule.
4. **State the caveat plainly, don't bury it:** "Done — but note: a key I generated (or any key my shell can `printenv`) is **best-effort in-session only** — it raises the bar, it is not real prevention. For genuine integrity, generate the key yourself and hold it where my tools can't read it (a CI secret), and run the enforcing check in CI/pre-merge. The block flag, though, IS solid (I can read it but can't change what the hook sees)."
5. Tell them the env takes effect on the next session (the hook reads it at launch), and the badge after a Claude Code restart.
