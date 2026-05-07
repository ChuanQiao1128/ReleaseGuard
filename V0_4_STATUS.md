# ReleaseGuard v0.4 Status

Working scope: scanner coverage expansion and override/evidence UX.

v0.4 does not add Playwright browser flows, generated tests, OpenAPI diff,
GitHub App/OAuth, PR comments, dashboard, pgvector, live GitHub sync, or
PASS/WARN/BLOCK semantic changes.

## Scanner Coverage Expansion

Status: Done

Done:
- Added scanner support for flat endpoint constants used in `fetch(...)`.
- Added scanner support for simple local fetch wrappers:
  - `fetcher("/api/...")`
  - `useSWR("/api/...", fetcher)`
  - `useSWR<T>("/api/...", fetcher)`
  - flat endpoint constants passed to those wrapper shapes
- The scanner still treats complex dynamic URLs, imported API clients, axios
  wrappers, tRPC, GraphQL, generated clients, and OpenAPI clients as unresolved.
- Updated scanner limitations to reflect v0.4 support honestly.

Focused external scanner result:
- `leerob/next-saas-starter`
  - Before v0.4: 0 resolved, 2 unresolved, unresolved rate `100.0%`
  - After v0.4: 4 resolved, 0 unresolved, unresolved rate `0.0%`
  - Resolved pattern: `swr_fetcher_literal`

## Evidence Declaration Protocol

Status: Done

Done:
- Added parser for optional test comments:
  - `// @releaseguard:covers api_apply_discount invalid_discount 400 error_status`
- Declarations attach graph-validated test nodes to known capabilities.
- Declarations are preferred over heuristic test detection when present in a
  test file.
- Unknown capability IDs are ignored; declarations cannot invent graph IDs.
- Existing heuristic detection remains fallback for unannotated tests.

## Override Suggestion UX

Status: Done

Done:
- Scanner coverage reports now include suggested override snippets.
- Scanner eval reports continue to include suggested override snippets.
- Suggestions are report-only and are not applied automatically.
- Suggestions do not affect evidence planning or merge decisions unless a user
  later commits an explicit override/config path.

## Autorun Harness

Status: Done

Done:
- Added `scripts/verify_releaseguard.sh` for full ReleaseGuard verification.
- Added `scripts/codex_autorun.sh` for controlled one-task Codex execution.
- Added `codex_tasks/TASK_QUEUE.md`.
- Added `AUTORUN_STATUS.md`.

## Commands Run

- `npm run test --workspace releaseguard -- scanner.test.ts evidenceDeclaration.test.ts scannerEval.test.ts`
- `npm run build --workspace releaseguard`
- `npm run releaseguard -- scanner eval --root /tmp/releaseguard-scanner-eval/next-saas-starter`

Full verification is recorded after the final v0.4 pass.
- `./scripts/verify_releaseguard.sh`

Final verification result:
- ReleaseGuard package tests: 19 files, 102 tests passed.
- ReleaseGuard package build passed.
- Scanner eval on this repo: 1 resolved callsite, 0 unresolved.
- Memory index: 46 chunks.
- Memory benchmark stayed at the v0.2.4 baseline.
- `demo-discount-regression`: `BLOCK`.
- `demo-missing-evidence`: `WARN`.
- `demo-docs-only`: `PASS`.
- `demo-rag-elevated-evidence`: `WARN`.
- Demo app tests passed after fixture runs.
- Demo app build passed with non-fatal Next.js webpack cache warnings.

## Limitations

- v0.4 resolves only simple local wrapper and endpoint-constant patterns.
- Cross-file endpoint constants are not resolved yet.
- Imported API client wrappers are still unresolved.
- Backend-only framework support remains out of scope for the current Next.js
  scanner.
- Evidence declarations currently cover test evidence only.

## Next

- Use `V0_4_PLAN.md` for the post-v0.4 direction.
