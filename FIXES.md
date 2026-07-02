# Groundtruth — bug-fix report (v0.8.0)

Groundtruth audits whether an agent did what it was asked. This release turned that lens on **Groundtruth itself** — first empirically (reading 14 of its own live sessions), then through two adversarial review passes. Every finding below was reproduced against the real code, fixed at the root, and locked with a regression test. Self-check went from 242 → **309 checks**; the red-team suite stayed 12/12 throughout.

**Method** (the same one Groundtruth preaches): for each fix we asked *"what made the wrong thing cheaper, and what's the cheapest way for a smart agent to make this check go green without doing the work?"* — then removed that path and left a test so it can't come back.

---

## How they were found

1. **Empirical scorecard.** We read every finding Groundtruth emitted across 14 of its own recent sessions (~22 findings). The majority were false positives, clustering into four buckets. That data — not intuition — set the fix priority: *precision of existing detectors first, new features last.*
2. **Adversarial code review (two passes).** An independent reviewer re-ran every repro against live code and actively tried to break the changes — crafting inputs to slip a real secret, stub, or `eval()` past the gate, and to make an incomplete task go green. Pass 1 found 2 criticals + 6 lesser; pass 2 confirmed those closed and found 1 residual. All fixed.

---

## Security

### S1 · A live secret was demoted from BLOCK to warn by attacker-adjacent text  *(critical)*
- **Symptom:** `const awsKey = "AKIA…real…"; // see example` passed the block gate. So did `EXAMPLE_TOKEN = "ghp_…"` and `sk_live_… // put YOUR key here`.
- **Root cause:** the example-key demotion tested the **whole line** (`SYNTHETIC_MARKER_RE.test(line)`) — but a marker anywhere on the line ("example", a `FAKE_` var name) is attacker-choosable. The design comment literally said "decide on content, not location," then decided on location.
- **Fix:** demote **only** when the matched key token itself is allowlisted or self-marks (`AKIAIOSFODNN7EXAMPLE`). A real-format key blocks regardless of surrounding text.
- **Test:** a real key with a `FAKE_` var name and with `// example` both still block; a token that self-marks (`…EXAMPLE`) demotes.

### S2 · Block-severity false positive on published example keys
- **Symptom:** the canonical AWS docs key (`AKIAIOSFODNN7EXAMPLE`), which lives in the project's own red-team fixture, produced a **block**.
- **Fix:** a small allowlist of published example credentials + a synthetic-marker check **on the key token** (`EXAMPLE`/`SAMPLE`/`FAKE`/…) demotes those to warn; everything else still blocks. Letter-boundaried so a marker glued into a key's charset can't spoof it.
- **Test:** example key → warn; real high-entropy key → block. (The red-team's own probe key was moved off the allowlisted value so its block-path scenarios still bite.)

---

## Stub / marker precision (self-match class)

### P1 · The stub detector flagged its own regex literal
- **Symptom:** `const STUB_MARKER_RE = /\b(TODO|FIXME|XXX|HACK)\b/` was reported as a stub. So were `// TODO` examples quoted inside doc comments and JSON strings.
- **Root cause:** markers matched raw bytes with no notion of *position* — "firing was cheaper than lexing."
- **Fix:** one shared position-aware layer. Markers (`TODO`/`FIXME`/…) count **only in comment/prose position**, with inline-code (`` `…` ``) treated as quotation; phrase-idioms (`NotImplementedError`, `throw…not implemented`, Rust `todo!()`) count **only in code position**; strings, regex literals, JSON, and fenced code are quotation everywhere. Block-comment and markdown-fence state thread across lines.
- **Also:** a marker immediately followed by enumeration punctuation (`TODO/FIXME`, `HACK)`) is a *list documenting* markers, not a real one.
- **Result:** self-audit Class-2 findings dropped and the engine's own source is now **0** self-matches (remaining hits are genuine test-fixture idioms).

---

## Compiled-rule precision

### R1 · `never use eval()` fired on `page.$eval()`
- **Symptom:** a rule forbidding the global `eval()` matched member access — Playwright's `page.$eval(...)` and `x.eval()`. (A prefix like `myeval()` was never matched — no word boundary — so only the `.`/`$` member-access cases were affected.)
- **Root cause:** `\b` treats `.` and `$` as word boundaries, so `\beval\s*\(` matched `.eval(` / `$eval(`.
- **Fix:** at the shared rule normalizer, a leading `\b` before an identifier in a **call rule** (pattern contains an escaped `\(`) upgrades to `(?<![\w$.])` — global `eval()` still fires, member calls don't. Identifier/column rules (no `\(`, e.g. `\bsignup_date\b`) are untouched so they still match `row.signup_date`. Applied at runtime, so it fixes already-armed rules with no re-arm.

### R2 · A rule fired on the very doc that declares it
- **Symptom:** a rule compiled from `ARCHITECTURE.md` ("never use eval") flagged `ARCHITECTURE.md` itself.
- **Fix:** a compiled rule never fires on its own declaring file (provenance is recorded on the rule; zero hand-maintenance).

### R3 · A call rule fired on the forbidden call *mentioned in a comment*
- **Symptom:** the `eval` rule flagged a comment that merely says `// … the global eval() …`.
- **Fix:** a call rule tests against the code portion only (comments stripped); comment-targeting rules (`@ts-ignore`) are left whole.

---

## Scan scope

### Z1 · Findings on the tool's own state and on out-of-repo throwaways
- **Symptom:** secrets/stubs/rules fired on `.claude/groundtruth/*` (Groundtruth's own state) and on scratchpad/`/tmp`/absolute-path files reaching the scan via the tool-ledger.
- **Fix:** the content scanners skip GT's own state (already covered by the integrity signature — a stronger sensor), absolute paths, `../` escapes, and `tmp/scratchpad/` throwaways. Audit the delivery, not the sandbox.

### Z2 · Phantom-import false positives on fixture strings
- **Symptom:** `./helper`, `./example` inside a test file's `const diff = "+import x from './helper'"` were reported as unresolved imports.
- **Fix:** an import counts only when its keyword survives string-blanking (an import-shaped substring *inside a string literal* is test data, not an import). Self-audit Class-4 findings: **3 → 0**.

---

## Tamper / integrity noise

### T1 · The out-of-band tamper caveat fired as noise on every MCP/Bash session
- **Symptom:** "referee state changed OUT-OF-BAND — compiled-rules.json" appeared as a warn/block finding on ordinary sessions. Grounding showed every session ran **unsigned** (`keyed:false`), so the signal couldn't be authoritative anyway.
- **Fix:** split by regime. **Trustworthy** (key set + valid signature) → a loud `tamper` finding. **Unsigned/best-effort** → a quiet `integrity_note` (info-tier) that renders as a card footer, **is not injected into the next turn, and does not flip the verdict**. Real forgery (an invalid signature) stays loud. Enforcement lives in the signature + CI, exactly as the tool already states.

---

## Open-loop ledger (the completeness backstop)

The ledger tracks each ask that names a deliverable and only closes it when the deliverable grounds in the diff. This release reworked it into a tiered model — and review found the rework had opened new holes, all now closed.

### L1 · A conversational aside became a phantom open loop  *(the original motivation)*
- **Symptom:** *"I can see a 304 in `handleUpload`, it's fine, no fix needed"* minted a task that could never close (no diff), nagged every turn, and escalated to block on any "done".
- **Fix:** a deterministic **request/non-request gate** — an observation/question with no surviving action verb is demoted to a **SOFT** aside (tracked, shown once, never blocks, auto-expires), not dropped. "…is fine, no fix needed" is an aside; "…but fix the 500 in `retry.js`" keeps its verb and stays a real task. *No LLM* — a model in front of every stop would void the "deterministic, offline" guarantee and could silently suppress a real open loop.

### L2 · A comment mention closed a code task  *(cheap-green on the close side)*
- **Symptom:** the cheapest way to "deliver" symbol `fooBar` was `// TODO: fooBar` — a comment mention grounded the task.
- **Fix:** a symbol deliverable grounds only when it lands in **non-comment code**; filenames still ground via diff headers.

### L3 · A generic "all done" escalated every unrelated pending task to block
- **Symptom:** one "Done!" flipped every open task to a blocking finding (the block-spam seen repeatedly in real sessions).
- **Fix:** **per-token done-match** — a task escalates only if the completion claim references *that task's own* deliverable token.

### L4 · The agent could demote its own task by naming the deliverable in its reply  *(critical, review)*
- **Symptom:** ask "add a csv export to `report.js`"; reply "Done — I added the csv export to `report.js`" → the ask was demoted to SOFT and went green.
- **Root cause:** a "token-novelty" heuristic treated any token appearing in *agent* text as a reference — but the agent's own reply is agent-authored, so it demoted the very ask it answered. An audited agent must never be able to shape its own verdict.
- **Fix:** token-novelty via agent text was **removed entirely**. Paste-provenance stays — it's grounded in the *user's* text (a `` ``` `` fence or a `file.js:line` stack-trace ref), which the agent can't author.

### L5 · A soft/reference token closed a hard task  *(review)*
- **Symptom:** "`handleUpload` is fine, but fix `retry.js`" — a diff touching `handleUpload` (the soft token) closed the hard `retry.js` task.
- **Fix:** a task grounds only on the tokens of its **own tier**; a soft token can't green a hard task.

### L6 · nag-once made a still-pending task read as "Told & Done"  *(review)*
- **Symptom:** after surfacing once, a pending hard task returned no finding — so the card printed "🟢 every ask delivered / Told & Done" while the ledger still held it open. Quiet == green is a lie.
- **Fix:** a pending hard task **always** emits a card finding (so the card honestly shows "N pending"); a repeat surface is marked `quiet`, which suppresses only *injection into the agent's context* (nag-once), not the card. A matching done-claim un-quiets and escalates.

### L7 · Paste-provenance was structurally dead
- **Symptom:** a `` ``` ``-fenced code paste in a question (`why does this crash?`) minted a hard open loop for the pasted symbol.
- **Root cause:** clause-splitting shredded the fence before the paste check ran.
- **Fix:** paste-stripping is computed on the **full ask once**, before clause-splitting.

### L8 · Polite/omitted imperatives were demoted to SOFT
- **Symptom:** "could you move `gameState` into `state.js`?" and "can you drop the retry from `queue.js`?" were treated as questions and never tracked.
- **Fix:** added `move`/`drop`/`split`/`port`/`convert`/… to the request-verb set; broadened the observation gate so "the 304 **is fine**" (bare copula) reads as an aside while a real verb survives the strip.

### L9 · An honest "still pending" disclosure was false-blocked; a far-away guard word dodged a real block  *(two-sided, review pass 2)*
- **Symptom (A):** "`upload.js` not yet done" was falsely escalated to block. **(B):** "Done — `upload.js` is complete, nothing pending, will close out" (a genuine false-done) dodged the block down to warn.
- **Root cause:** the done-claim negation guard reused the ask-oriented clause splitter and tested the **whole clause** — so it both shredded "not yet done" and let a far-away "pending/will" (about *other* work) suppress a real escalation.
- **Fix:** decide on **proximity** — a ±3-word window around each occurrence of the token — against a strong-signal negation set (`still`/`pending`/`not`/`will`/`yet`/…). `remaining`/`left` were excluded because they invert ("nothing remaining"); `still` already covers genuine "remaining" cases. This closes both reported cases (the far-away/`remaining` dodge and the shredded "not yet done"). It does **not** eliminate the ceiling — see the residual note below: within the ±3-word window the ambiguity is irreducible in **both** directions.

---

## Residual / documented limits (honest scope)

- **Bare `TODO` as prose inside a comment** (no backticks) is indistinguishable from a real one deterministically — the one self-match class that remains, and near-zero on a normal repo.
- **Computed-member `eval`** (`window["eval"](x)`, `globalThis.eval`, aliasing) is not caught by the call-position rule — a pre-existing limit, not opened by this change.
- **Deterministic-NL ceiling** on request/aside classification and claim-negation: position and structure cover ~95%; genuine natural-language understanding is off the deterministic table by design. Each such shortcut is marked in-source. **This ceiling is two-sided, not purely fail-safe.** The claim-negation window (L9) shows both failure modes with the token's file *absent* from the diff (i.e. a real false-done):
  - **Unsafe miss (bounded):** a negation/deferral word placed within ~3 words of the deliverable token demotes a genuine false-done from block → **warn** — e.g. `"upload.js done, will do next"`, `"finished upload.js, todo elsewhere"`. It is *bounded*, never silent/green: the task stays **pending**, the warn stays on the card, and the Class-3 no-op independently warns on a past-tense false claim — so the backstop degrades to warn, never to a clean pass.
  - **Fail-safe miss:** an honest negation *outside* the window (`"upload.js is a really important file that is not yet done"`) false-blocks an honest agent — hides nothing.
  Widening the window trades one for the other; there is no fixed-window setting that closes both. The `±3` window is a `ponytail:`-marked tuning knob in-source, biased toward block on the *far-away* case (the security-relevant one), while accepting this bounded near-token miss.

The through-line: **abstain or fail safe where a check is provably correct; where it isn't (the NL ceiling), degrade to a bounded warn — never to a clean green — and never let the audited agent influence its own verdict.**
