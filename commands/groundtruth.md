---
description: "Show Groundtruth's latest verdict card for this session"
---

Run exactly this command and show the user its output verbatim inside a fenced code block — do not summarize, re-rank, or add analysis:

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/groundtruth.mjs" --latest
```

That prints the most recent Groundtruth verdict card (the per-turn audit: Honesty / Rules / Completeness / Debt) from `.claude/groundtruth/`.

If it prints nothing, tell the user: "No verdict card yet this session — Groundtruth writes one when a turn ends (the Stop hook)."
