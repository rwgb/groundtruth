---
description: "One-shot Groundtruth setup check — detects what's configured and hands you the exact actions for the rest."
---

You are running the Groundtruth setup check. Some things a Claude Code plugin **cannot set itself** — the main `statusLine` and any env var — so this command DETECTS the current state and gives the user the exact, copy-pasteable action for anything missing. Be concise: a 4-line checklist (✓ / ✗ + the one-line fix), then a one-line summary. Do NOT change any setting yourself except where a sub-command is the right tool; for `settings.local.json` edits, SHOW the user the block to paste (it's their file).

First, resolve two paths you'll need:
- the **project root** = the cwd.
- the **plugin hooks dir**: find the newest `*/hooks/groundtruth-statusline.mjs` under `~/.claude/plugins/cache/groundtruth/groundtruth/` (use the highest version). Call it `<HOOKS>`. If you can't find it, fall back to telling the user to point at their groundtruth checkout's `hooks/`.

Then check each item and report `✓`/`✗`:

1. **Rules approved** (the core gate). Read `.claude/groundtruth/proposed-rules.json` and `compiled-rules.json`. Count clean-proposed (`status:"armable"`) vs approved.
   - ✗ if any clean rule is unapproved → **"`N` rules proposed, none/some armed — reply `/groundtruth-rules approve-all` to arm the clean ones (or `/groundtruth-rules` to review first). Nothing is enforced until you do."**
   - If `proposed-rules.json` is missing, init hasn't run: say "start a fresh session, or run `node \"<HOOKS>/compile-rules.mjs\" .`".

2. **Status badge** (recommended — in the VS Code extension, warn/clean verdicts only show via the badge). Read `.claude/settings.local.json` (and `settings.json`) for a `statusLine` key.
   - ✗ if absent → give the EXACT block to paste into `.claude/settings.local.json`, with `<HOOKS>` filled in:
     ```json
     "statusLine": { "type": "command", "command": "node \"<HOOKS>/groundtruth-statusline.mjs\"" }
     ```
     Note: only ONE statusLine can exist — if they already use one (ponytail, etc.), this replaces it.

3. **Block mode** (default = warn, which is correct until you trust precision). Run `printenv GROUNDTRUTH_BLOCK` to detect the env anchor; also check `.claude/groundtruth/config.json` for `{block:true}`.
   - Report the live mode. To enable: **`/groundtruth-block on`** (convenience, agent-writable) OR add `"env": { "GROUNDTRUTH_BLOCK": "1" }` to `.claude/settings.local.json` (the **un-disablable** anchor — recommended for enforcement). Keep warn until you've watched it run clean on your real sessions; false positives are disruptive in block mode.

4. **Integrity key** (optional, security-critical only). Run `printenv GROUNDTRUTH_KEY` to detect.
   - If unset, say: "Optional — `GROUNDTRUTH_KEY=<random>` in `settings.local.json` env signs the integrity snapshot. Be honest about scope: **in-session it's best-effort** (the agent's shell can read the key), so it only raises the bar. **Real tamper-prevention is a CI/pre-merge gate**, not the in-session hook. Generate one with `node -e \"console.log(require('crypto').randomBytes(24).toString('hex'))\"`. Don't reuse a real credential."
   - Remind: env vars belong in `settings.local.json` (or the shell `claude` was launched from) — a project `.env` is the app's, NOT read by the hook. And `settings.local.json` should be gitignored (it holds the key); if it's tracked, `git rm --cached .claude/settings.local.json`.

End with one summary line, e.g.: `Setup → rules: ✗ run approve-all · badge: ✗ · block: warn (on = enforce) · key: off (CI = real enforcement).`

Then **offer to do the `settings.local.json` parts yourself** (the user asked for this): *"Want me to set up `settings.local.json` now — generate a random key, add the status badge + `GROUNDTRUTH_BLOCK=1`, and make sure the file is gitignored?"* If they say yes:
1. Generate a key: ``node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`` — capture the output; do NOT invent one.
2. Read `.claude/settings.local.json` (create `{}` if absent), and **merge** (preserve existing keys): add `env.GROUNDTRUTH_BLOCK = "1"` (only if the user wants block — default to leaving it as warn and ask), `env.GROUNDTRUTH_KEY = <generated>`, and the `statusLine` block from step 2 with `<HOOKS>` filled in. Write valid JSON.
3. If `.claude/settings.local.json` is git-tracked (`git ls-files --error-unmatch` succeeds), run `git rm --cached .claude/settings.local.json` so the key never gets committed, and confirm it matches a `.gitignore` rule.
4. **State the caveat plainly, don't bury it:** "Done — but note: a key I generated (or any key my shell can `printenv`) is **best-effort in-session only** — it raises the bar, it is not real prevention. For genuine integrity, generate the key yourself and hold it where my tools can't read it (a CI secret), and run the enforcing check in CI/pre-merge. The block flag, though, IS solid (I can read it but can't change what the hook sees)."
5. Tell them the env takes effect on the next session (the hook reads it at launch), and the badge after a Claude Code restart.
