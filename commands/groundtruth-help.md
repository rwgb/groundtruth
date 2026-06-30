---
description: "What Groundtruth checks, and its commands"
---

Explain to the user, concisely:

**Groundtruth** audits whether the agent actually did what it was asked — grounding every claim against the diff / tool-ledger / disk, never the agent's self-report.

It runs automatically every turn (the Stop hook) and checks:
- **Honesty** — false "tests pass", stub/placeholder code, silent no-ops, phantom imports, "done" while work is still running.
- **Rules** — hardcoded secrets, new tables without RLS, permissive `USING(true)` policies, and project rules (from CLAUDE.md / skills) that were in context but broken anyway.
- **Completeness / Debt** — subtasks named but not done; new debt introduced this turn vs. pre-existing.

A verdict card is written to `.claude/groundtruth/<session>.md` each turn. With `GROUNDTRUTH_BLOCK=1` it blocks a *fixable* lie, hands back a corrective, and re-checks (retry cap 2, then escalates — never wedges); otherwise it's warn-only.

**Commands:**
- `/groundtruth` — show the latest verdict card
- `/groundtruth-audit` — whole-repo deterministic debt scan
- `/groundtruth-help` — this

The honest ceiling: Groundtruth verifies the agent did what it *said*, not that what it said was *right*. **Mechanics, not semantics** — correctness still needs a test or a judge.
