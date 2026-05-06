# ReleaseGuard v0.1 Status

Working scope: implement the v0.1 vertical slice only. No RAG, vector store, GitHub integration, generated tests, Playwright browser flows, OpenAPI diff, dashboard, or benchmark work.

## Milestone 1 - ReleaseGuard package + CLI scaffold

Status: Done

Done:
- Read `AGENTS.md`.
- Confirmed this workspace has no `.git` directory, so fixture mode is required for the demo regression path.
- Added `packages/releaseguard` workspace package.
- Added CLI entrypoint and argument parsing for `releaseguard run --base <base> --head <head>` and `releaseguard run --fixture demo-discount-regression`.
- Added root `npm run releaseguard -- ...` script.

Tests run:
- `npm run test --workspace releaseguard -- --runInBand` failed because `--runInBand` is not a Vitest option.
- `npm run test --workspace releaseguard` passed.

Issues:
- None remaining.

Next:
- Implement and verify the capability graph schema.

## Milestone 2 - Capability Graph schema

Status: Done

Done:
- Added v0.1 graph schemas for `CapabilityNode`, `CapabilityEdge`, `CapabilityGraph`, `EvidenceRef`, and discrete `ConfidenceLevel`.
- Restricted node types to `file`, `route`, `api`, and `test`.
- Restricted edge types to `defines`, `consumes`, and `tested_by`.

Tests run:
- `npm run test --workspace releaseguard`

Issues:
- None.

Next:
- Implement and verify Next.js route/API scanner, direct fetch scanner, test scanner, graph artifact, and coverage report.

## Milestones 3-5 - Repo Scanner, Direct Fetch Literal Scanner, Test Scanner

Status: Done

Done:
- Added scanner modules for Next.js App Router routes and API handlers.
- Added direct `fetch("/api/...")` literal scanner with unsupported fetch calls marked unresolved.
- Added demo discount API test scanner with explicit `invalid_discount`, `400`, and `error_status` case tags.
- Added scanner artifact writers for `.releaseguard/capability_graph.json` and `.releaseguard/coverage_report.md`.

Tests run:
- `npm run test --workspace releaseguard`

Issues:
- None.

Next:
- Implement and verify change impact fallback, citation validation, and evidence planning.

## Milestones 6-8 - Change Impact Fallback, Citation Validator, Evidence Planner

Status: Done

Done:
- Added deterministic change impact fallback with graph traversal from changed API to consuming route.
- Added strict Change Impact Agent output schema with merge-decision and risk fields rejected.
- Added citation validation for known graph node and edge IDs.
- Added deterministic evidence planner and existing test selector for invalid discount API evidence.

Tests run:
- `npm run test --workspace releaseguard`

Issues:
- None.

Next:
- Implement and verify selected test execution, regression fixture, deterministic decision, markdown report, and CLI pipeline.

## Milestones 9-12 - Executor, Regression Fixture, Decision Engine, Markdown Report

Status: Done

Done:
- Added selected test executor that runs demo app test files and writes `evidence_result.json` plus `test_results.json`.
- Added `demo-discount-regression` fixture file and temporary apply/restore helper.
- Added deterministic decision engine.
- Added markdown report renderer.

Tests run:
- `npm run test --workspace releaseguard`
- `npm run build --workspace releaseguard`
- `npm run releaseguard -- run --fixture demo-discount-regression`
- `npm run test --workspace @releaseguard/demo-app`

Issues:
- Initial fixture CLI run failed because npm workspace scripts execute from `packages/releaseguard`; fixed CLI repository root discovery and reran successfully.

Next:
- Run final verification suite and update README.

## Milestone 13 - Tests, Verification, README

Status: Done

Done:
- Verified fixture command produces `Decision: BLOCK`.
- Verified generated graph contains `route_checkout`, `api_apply_discount`, a `consumes` edge, and `test_api_discount_invalid`.
- Verified normal demo app tests pass after fixture restore.
- Updated README with v0.1 support boundaries, exclusions, demo command, expected output, and artifact paths.
- Final report generated at `artifacts/releaseguard/20260506T121248Z/report.md`.

Tests run:
- `npm run test --workspace releaseguard`
- `npm run build --workspace releaseguard`
- `npm run releaseguard -- run --fixture demo-discount-regression`
- `npm run test --workspace @releaseguard/demo-app`
- `npm test`
- `npm run build --workspace @releaseguard/demo-app`
- `npm audit --omit=dev`
- `npm test && npm run build --workspace releaseguard && npm run releaseguard -- run --fixture demo-discount-regression && npm run test --workspace @releaseguard/demo-app`
- `npm test && npm run build --workspace releaseguard && npm run build --workspace @releaseguard/demo-app && npm run releaseguard -- run --fixture demo-discount-regression && npm run test --workspace @releaseguard/demo-app`

Issues:
- `npm audit --omit=dev` reports Next.js/PostCSS advisories. npm's suggested fix upgrades to Next 16, which is outside the required Next.js 14 v0.1 demo scope.

Next:
- v0.1 Definition of Done is met.

## v0.1.1 Hardening

Status: Done

Done:
- Added fixture restore test proving `demo-discount-regression` restores the original route file and leaves the normal 400 path intact.
- Strengthened citation validation to reject citations outside the affected graph slice.
- Added negative citation tests for nonexistent capability IDs, nonexistent citation IDs, unrelated graph citations, and forbidden agent fields.
- Added golden-style report renderer test for the BLOCK report.
- Updated scanner limitations to explicitly include endpoint constants, template literals, axios wrappers, tRPC, GraphQL, generated clients, OpenAPI clients, dynamic URLs, and monorepos.
- Updated README first screen with the demo command and expected BLOCK output.
- Added `SECURITY_NOTES.md` documenting the Next.js 14 audit advisory context.

Tests run:
- `npm run test --workspace releaseguard`
- `npm run build --workspace releaseguard`
- `npm test`
- `npm run build --workspace @releaseguard/demo-app`
- `npm run releaseguard -- run --fixture demo-discount-regression`
- `npm run test --workspace @releaseguard/demo-app`
- `npm audit --omit=dev`

Issues:
- `npm audit --omit=dev` still reports Next.js/PostCSS advisories. This is documented in `SECURITY_NOTES.md`; npm's suggested fix upgrades to Next 16, outside the v0.1 Next.js 14 scanner scope.
- Latest fixture report: `artifacts/releaseguard/20260506T122134Z/report.md`.

Next:
- Local git repository initialized on `main`.
- Initial commit created.
- Tag `releaseguard-v0.1` created.
- Remote `origin` set to `git@github.com:ChuanQiao1128/ReleaseGuardAgents.git`.
- Push was not run.

## v0.1.2 Missing Evidence Demo

Status: Done

Done:
- Created branch `v0.1.2-missing-evidence`.
- Added `demo-missing-evidence` fixture support.
- The fixture temporarily scans a valid-only discount API test file so `invalid_discount` evidence is genuinely absent from the capability graph.
- Evidence Planner records missing `invalid_discount`, `400`, and `error_status` evidence for high-risk `api_apply_discount`.
- Decision Engine returns `WARN` through the existing high-risk missing-evidence rule.
- Added tests for missing evidence fixture output, fixture restoration, WARN decision path, and missing evidence report content.
- Updated README with BLOCK and WARN demo commands.
- Set ReleaseGuard package tests to run fixture-mutating test files serially to avoid source-file fixture races.

Tests run:
- `npm run test --workspace releaseguard` initially failed because fixture-mutating tests ran in parallel and temporarily changed the shared demo test file.
- `npm run test --workspace releaseguard` passed after disabling package test file parallelism.
- `npm run test --workspace releaseguard && npm run build --workspace releaseguard && npm test && npm run build --workspace @releaseguard/demo-app && npm run releaseguard -- run --fixture demo-discount-regression && npm run releaseguard -- run --fixture demo-missing-evidence && npm run test --workspace @releaseguard/demo-app`

Issues:
- None currently.
- Latest BLOCK fixture report: `artifacts/releaseguard/20260506T123542Z/report.md`.
- Latest WARN fixture report: `artifacts/releaseguard/20260506T123544Z/report.md`.

Next:
- Commit, tag `releaseguard-v0.1.2`, and push the branch/tag.
