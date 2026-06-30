---
description: "Groundtruth: whole-repo debt scan (stubs, no-ops, phantom refs, secrets, RLS-off) — findings, not a verdict"
---

Run exactly this command and show the user its output:

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/groundtruth.mjs" --audit
```

This is a static scan of the repo's tracked files for stub/placeholder code, phantom imports, hardcoded secrets, and RLS-off tables. It is a findings list, NOT a judgement of any single turn. Present the findings plainly; if there are none, say the repo is clean on these deterministic checks.
