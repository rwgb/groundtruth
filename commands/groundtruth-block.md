---
description: "Turn Groundtruth BLOCK mode on/off (default: warn). No settings.json edit needed."
argument-hint: "on | off"
---

Set Groundtruth's block mode based on the argument: **$ARGUMENTS** (expect `on` or `off`; if empty, read the current value and report it).

Do this:
1. Read `.claude/groundtruth/config.json` in the project root if it exists (preserve any other keys).
2. Write it back with `"block": true` if the argument is `on`, or `"block": false` if `off`. If empty, just report the current `block` value.
3. Confirm to the user: "Groundtruth block mode is now ON/OFF — effective next turn (the Stop hook re-reads the config each run; no restart needed)."

Context to relay: **block** = a *fixable* catch (false "tests pass", a hardcoded secret, an RLS hole, a pending task claimed done) halts the stop with a corrective and a retry cap → escalate. **warn** = the same finding is surfaced (card + badge) but never halts. Warn is the safe default; turn block on once you trust the precision.
