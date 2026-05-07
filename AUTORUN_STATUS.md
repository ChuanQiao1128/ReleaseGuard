# Codex Autorun Status

Created: 2026-05-07

Current project status:
- v0.1.8 merge impact gate is complete.
- v0.2.4 repo-memory RAG foundation is complete.
- v0.3 RAG-informed evidence priority is complete.
- v0.3.1 scanner eval tooling is complete.
- v0.3.2 real repo scanner evaluation pack is in progress on
  `v0.3.2-real-repo-scanner-eval`.

Autorun policy:
- One task per autorun round by default.
- Full ReleaseGuard verification runs after each task.
- The script stops after one changed task so a human can review before
  continuing.
- The script never pushes to remote.

## Log

- 2026-05-07: Added controlled autorun harness files.
- 2026-05-07: Completed v0.4 scanner expansion manually in Codex instead of
  running an unbounded autorun loop.
  - Files changed: scanner fetch callsite resolution, test evidence
    declarations, scanner eval docs, v0.4 status/plan docs, autorun scripts.
  - Tests run so far:
    `npm run test --workspace releaseguard -- scanner.test.ts evidenceDeclaration.test.ts scannerEval.test.ts`
    and `npm run build --workspace releaseguard`.
  - Limitations: v0.4 does not add Playwright, generated tests, OpenAPI diff,
    GitHub App/OAuth, PR comments, dashboard, pgvector, or live GitHub sync.
  - Next suggested task: run full verification and review the v0.4 branch.
- 2026-05-07: Full v0.4 verification passed with
  `./scripts/verify_releaseguard.sh`.
