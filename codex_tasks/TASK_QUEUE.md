# ReleaseGuard Codex Task Queue

Rules:
- Read `AGENTS.md` first.
- Do not skip verification.
- After each task, update `AUTORUN_STATUS.md`.
- Do not add features outside the task.
- If tests fail and cannot be fixed safely, stop and document the blocker.
- Do not push unless explicitly asked.
- RAG must not directly decide `PASS` / `WARN` / `BLOCK`.
- Agents must not output merge decisions.
- Decision Engine remains deterministic.

---

## TASK 001 - Scanner Eval Pack Polish

Status: Done manually in v0.4.

Goal:
Finalize scanner eval reporting and make the reports easier to present.

Scope:
- Improve `docs/scanner_eval/summary.md` readability.
- Add a clear recommendation section:
  - scanner expansion before Playwright if unresolved rate is high.
- Add top unresolved pattern descriptions.
- Do not add Playwright.
- Do not add new scanner support unless needed for report formatting.

Out of Scope:
- Playwright browser flows.
- Scanner behavior changes beyond report formatting.
- PASS/WARN/BLOCK semantic changes.

Acceptance:
- Existing commands pass.
- `docs/scanner_eval/summary.md` clearly shows real repo results.
- README links to scanner eval summary.

---

## TASK 002 - Evidence Declaration Protocol

Status: Done manually in v0.4.

Goal:
Add a minimal evidence declaration parser for test comments.

Example:

```ts
// @releaseguard:covers api_apply_discount invalid_discount
```

Scope:
- Parse ReleaseGuard coverage annotations from test files.
- Attach parsed declarations to test nodes.
- Existing heuristic test detection remains fallback.
- Add tests proving declared evidence is preferred over filename/test-name heuristics.
- Do not change `PASS` / `WARN` / `BLOCK` semantics beyond using declared evidence where available.

Out of Scope:
- Generated tests.
- Browser evidence declarations.
- Live GitHub ingestion.

Acceptance:
- Existing v0.1 self-check still passes.
- New tests for annotation parsing pass.
- README documents optional evidence declarations.

---

## TASK 003 - Override Suggestion UX

Status: Done manually in v0.4.

Goal:
Improve scanner unresolved output by suggesting override snippets.

Scope:
- For unresolved callsites, generate suggested overrides when consumer/provider can be guessed.
- Add examples to `coverage_report.md` and scanner eval reports.
- Do not auto-apply overrides.
- Do not make override suggestions affect decisions unless the user commits config.

Out of Scope:
- Applying overrides automatically.
- Dashboard or interactive UX.
- PASS/WARN/BLOCK semantic changes.

Acceptance:
- Scanner eval report includes suggested override examples.
- Unsupported repo still reports cleanly.
- Existing commands pass.

---

## TASK 004 - Real Repo Scanner Eval Expansion

Status: Deferred. v0.4 reused the existing three-repo pack and updated metrics
after scanner expansion. Do not fabricate additional external repo results.

Goal:
Add more scanner eval data if available.

Scope:
- Add 2 additional scanner eval reports if local external repos are available.
- If not available, write instructions only and do not fake results.
- Summarize unresolved rates and next scanner priorities.

Out of Scope:
- Vendoring external repositories.
- Fabricating scanner metrics.

Acceptance:
- `docs/scanner_eval/summary.md` updated honestly.
- No fabricated external repo results.

---

## TASK 005 - v0.4 Planning Checkpoint

Status: Done manually in v0.4.

Goal:
Do not implement post-v0.4 features. Produce a concrete v0.4 completion report based on scanner eval and v0.4 implementation results.

Scope:
- Write `V0_4_PLAN.md`.
- Decide whether the next implementation after v0.4 should be:
  - Scanner coverage expansion
  - Playwright browser smoke runner
  - Evidence declaration protocol expansion
- Include milestones and acceptance criteria.

Out of Scope:
- Implementing v0.5 features.
- Adding Playwright.
- Adding dashboard or GitHub App work.

Acceptance:
- Plan explains why.
- Plan includes milestones and acceptance criteria.
