# ReleaseGuard

CI tells you tests passed. ReleaseGuard tells you whether the thing this PR actually changed was tested.

```text
PR diff -> Capability Graph -> Evidence Plan -> Selected Tests -> PASS/WARN/BLOCK
```

Run the v0.1 demo:

```bash
npm run releaseguard -- run --fixture demo-discount-regression
# Decision: BLOCK

npm run releaseguard -- run --fixture demo-missing-evidence
# Decision: WARN

npm run releaseguard -- run --fixture demo-docs-only
# Decision: PASS
```

Run all fixture checks:

```bash
npm run releaseguard:selfcheck
```

Run on a real git diff:

```bash
npm run releaseguard -- run --base main --head HEAD
# or
npm run releaseguard -- run --base origin/main --head HEAD
```

Run the real diff regression demo on a temporary branch:

```bash
git checkout -b demo-real-diff-discount-regression
cp packages/releaseguard/fixtures/demo-discount-regression/route.ts apps/demo-app/src/app/api/discount/apply/route.ts
git add apps/demo-app/src/app/api/discount/apply/route.ts
git commit -m "demo: introduce discount regression"
npm run releaseguard -- run --base main --head HEAD
# Decision: BLOCK
```

`demo-discount-regression` expected output:

```text
Decision: BLOCK
Reason: selected high-priority evidence failed.
Report: artifacts/releaseguard/<run_id>/report.md
```

The demo fixture simulates a PR where the discount API regresses invalid codes from HTTP 400 to HTTP 500. ReleaseGuard scans the repo, sees that `/checkout` consumes `POST /api/discount/apply`, selects the existing invalid-discount API test, runs it, and blocks the merge when the selected evidence fails.

`demo-missing-evidence` expected output:

```text
Decision: WARN
Reason: high-risk capability has missing required evidence.
Report: artifacts/releaseguard/<run_id>/report.md
```

That fixture simulates a high-risk discount API change where only valid-discount evidence exists. ReleaseGuard still identifies `api_apply_discount` and `route_checkout`, but it cannot find required `invalid_discount` evidence, so it warns instead of pretending the change is covered.

`demo-docs-only` expected output:

```text
Decision: PASS
Reason: low-risk docs-only change.
Report: artifacts/releaseguard/<run_id>/report.md
```

That fixture simulates a README-only change. ReleaseGuard classifies the scope before scanning, fast-skips capability/evidence/test work, and writes a PASS report.

## v0.1 support

ReleaseGuard v0.1 is a narrow vertical slice for the demo app only.

It supports:

- Next.js 14 App Router + TypeScript demo scanning.
- `/checkout` route detection.
- `POST /api/discount/apply` API detection.
- Direct literal frontend calls like `fetch("/api/discount/apply")`.
- Tagged existing API test selection for invalid discount behavior.
- Deterministic change impact fallback when no LLM provider is configured.
- Citation validation for known graph node and edge IDs.
- Selected test execution.
- Deterministic `PASS` / `WARN` / `BLOCK` decisions.
- Markdown reports under `artifacts/releaseguard/<run_id>/report.md`.
- Fixture demos for `BLOCK`, `WARN`, and `PASS`.
- Real git diff mode using changed file paths from `git diff`.
- GitHub Actions fixture self-checks and non-blocking real diff preview.

It does not support:

- RAG, embeddings, pgvector, or vector search.
- GitHub App, OAuth, webhook integration, PR comments, or GitHub check enforcement.
- Generated tests, self-healing tests, or Playwright browser flows.
- OpenAPI diff, contract runners, database migration runners, or dashboards.
- Monorepos beyond this local npm workspace demo.
- Endpoint constants, template literals, axios wrappers, tRPC, GraphQL, generated clients, OpenAPI clients, and dynamic URLs.

## v0.2 Repo Memory RAG

v0.1 uses the Capability Graph for structured code dependencies:

```text
file -> route/API/test -> evidence -> PASS/WARN/BLOCK
```

v0.2 begins Repo Memory RAG for unstructured repository knowledge:

- docs,
- ADRs,
- incidents,
- previous ReleaseGuard reports.

The v0.2 principle is:

```text
Graph for structured dependencies. RAG for unstructured repo memory.
```

Build the local repo memory index:

```bash
npm run releaseguard -- memory index
```

This writes:

```text
.releaseguard/memory_chunks.json
```

Run the v0.2 retrieval benchmark:

```bash
npm run releaseguard -- memory benchmark
```

This writes:

```text
.releaseguard/reports/rag_benchmark_v0_2.md
.releaseguard/reports/rag_benchmark_v0_2.json
```

Generate the discount/checkout repo-memory demo report:

```bash
npm run releaseguard -- memory demo-discount-context
```

This writes:

```text
.releaseguard/reports/rag_demo_discount_context.md
```

v0.2 supports deterministic local repo-memory retrieval:

- capability tagging for chunks using graph-backed file paths and conservative keywords,
- BM25 baseline retrieval,
- deterministic local embedding baseline,
- Reciprocal Rank Fusion hybrid retrieval with `k=60`,
- source trust tiers and current-PR document self-immunity hooks,
- memory chunk citation validation,
- deterministic retrieval eval dataset generation,
- benchmark reports with Recall@5, MRR, and no-answer false positive rate,
- a discount/checkout demo showing historical ADR and incident context from a noisy local docs corpus.

v0.2 RAG is report-only. It does not affect evidence planning, does not lower evidence requirements, and does not change `PASS` / `WARN` / `BLOCK` decisions. v0.3 may use trusted memory to inform evidence priority, but only with trust safeguards and deterministic decision ownership.

v0.2 does not support pgvector, live GitHub issue/PR sync, reranking, arbitrary CI log ingestion, PR comments, GitHub App/OAuth, generated tests, Playwright browser flows, OpenAPI diff, or dashboards.

## Day 1 demo app

The v0.1 demo app lives in `apps/demo-app`.

It includes:

- `/checkout`, rendered by `src/app/checkout/page.tsx`
- `POST /api/discount/apply`, rendered by `src/app/api/discount/apply/route.ts`
- API tests in `tests/api/discount.test.ts`

Run the demo app tests from the repository root:

```bash
npm test
```

Or run them inside the app:

```bash
cd apps/demo-app
npm test
```

## Run ReleaseGuard v0.1

The regression path is provided as a fixture:

```bash
npm run releaseguard -- run --fixture demo-discount-regression
```

Expected output:

```text
Decision: BLOCK
Reason: selected high-priority evidence failed.
Report: artifacts/releaseguard/<run_id>/report.md
```

The fixture temporarily applies a bug where invalid discount codes return HTTP 500 instead of HTTP 400, runs the selected existing API test, writes the report, and restores the normal route file.

Run the missing-evidence fixture:

```bash
npm run releaseguard -- run --fixture demo-missing-evidence
```

Expected output:

```text
Decision: WARN
Reason: high-risk capability has missing required evidence.
Report: artifacts/releaseguard/<run_id>/report.md
```

The fixture temporarily scans a valid-only discount API test file. No selected test satisfies the required `invalid_discount`, `400`, and `error_status` evidence, so the deterministic decision engine returns `WARN`.

Run the docs-only fixture:

```bash
npm run releaseguard -- run --fixture demo-docs-only
```

Expected output:

```text
Decision: PASS
Reason: low-risk docs-only change.
Report: artifacts/releaseguard/<run_id>/report.md
```

The fixture simulates a docs-only change and fast-skips scanner, impact, evidence planning, and test execution.

Scanner artifacts are written to:

- `.releaseguard/capability_graph.json`
- `.releaseguard/coverage_report.md`

## Real PR Diff Mode

ReleaseGuard v0.1.5 can read real changed file paths from git:

```bash
npm run releaseguard -- run --base main --head HEAD
npm run releaseguard -- run --base origin/main --head HEAD
```

Real diff mode uses:

```bash
git diff --name-only --diff-filter=ACMRT <base> <head>
```

It then feeds those changed files into the same scope analyzer, scanner, impact fallback, evidence planner, selected test executor, decision engine, and markdown report pipeline used by the fixture demos.

Expected v0.1.5 behavior:

- docs-only changes, such as `README.md`, return `PASS` with `low-risk docs-only change.`
- `apps/demo-app/src/app/api/discount/apply/route.ts` maps to `api_apply_discount`, traverses to `route_checkout`, and selects `tests/api/discount.test.ts`.
- unmapped source changes return `WARN` with `source change could not be mapped to known capability.`

Real diff mode requires a git repository and valid refs. If git is unavailable or refs are invalid, use the fixture commands for the demo path. GitHub Actions still runs fixture self-checks first; real PR workflow enforcement is not part of v0.1.7.

## Real Diff Demo

This demo uses a real git branch and real `git diff` output. It does not use `--fixture`.

Start from a clean `main` branch:

```bash
git checkout main
git pull --ff-only origin main
git checkout -b demo-real-diff-discount-regression
```

Apply the demo regression to the branch:

```bash
cp packages/releaseguard/fixtures/demo-discount-regression/route.ts apps/demo-app/src/app/api/discount/apply/route.ts
git add apps/demo-app/src/app/api/discount/apply/route.ts
git commit -m "demo: introduce discount regression"
```

Run ReleaseGuard in real diff mode:

```bash
npm run releaseguard -- run --base main --head HEAD
```

Expected output:

```text
Decision: BLOCK
Reason: selected high-priority evidence failed.
Report: artifacts/releaseguard/<run_id>/report.md
```

What happens:

- `git diff` reports `apps/demo-app/src/app/api/discount/apply/route.ts`.
- The scanner maps that file to `api_apply_discount`.
- Graph traversal marks `route_checkout` affected because it consumes the API.
- Evidence planning selects `tests/api/discount.test.ts`.
- The selected invalid-discount test fails because the branch returns HTTP 500.
- The deterministic decision engine returns `BLOCK`.

Clean up after the demo:

```bash
git checkout main
git branch -D demo-real-diff-discount-regression
```

If ReleaseGuard sees a source file change that cannot be mapped to a known capability, it fails safe with `WARN` instead of `PASS`.

## Run In CI

ReleaseGuard includes a GitHub Actions workflow at `.github/workflows/releaseguard.yml`.

The workflow runs on `pull_request` and `workflow_dispatch`. It installs dependencies, builds and tests the workspace, runs all three fixture checks, uploads `artifacts/releaseguard`, and writes a job summary.

Fixture self-check is the required CI validation:

```bash
npm run releaseguard:selfcheck
```

On pull requests, the workflow also runs real diff preview:

```bash
npm run releaseguard -- run --base <base_sha> --head <head_sha>
```

## GitHub Actions Real Diff Preview

v0.1.7 adds a non-blocking real diff preview to the pull request workflow.

The workflow:

- checks out the repository with `fetch-depth: 0`,
- runs the fixture self-check as the required validation,
- runs real diff preview with `github.event.pull_request.base.sha` and `github.event.pull_request.head.sha`,
- uploads `artifacts/releaseguard`,
- writes the fixture self-check result, real diff decision, reason, report path, and preview note to the GitHub Step Summary.

Real diff preview is intentionally non-blocking in v0.1.7. A real diff `BLOCK` or `WARN` is reported in the summary and artifacts, but it does not fail the workflow yet. If the preview command has an infrastructure error, the workflow captures the exit code and logs it in the summary instead of silently ignoring it.

ReleaseGuard Actions preview verified with a docs-only pull request.

## Verified v0.1.8 PR

ReleaseGuard v0.1.8 includes the first GitHub Actions verified PR preview.

- PR: https://github.com/ChuanQiao1128/ReleaseGuardAgents/pull/1
- Decision: PASS
- Reason: low-risk docs-only change.
- Artifacts uploaded: `releaseguard-artifacts`

This PR verifies the GitHub Actions real diff preview path:

```text
docs-only change -> real diff mode -> Decision: PASS -> artifact uploaded
```

A later milestone can map real diff decisions to check conclusions, for example `BLOCK` as failure and `WARN` as neutral.

## Security note

The demo app is pinned to Next.js 14.x to match the v0.1 framework scanner scope. `npm audit` may report advisories in the Next.js dependency tree. For production use, the scanner should be validated against the current Next.js major version. This demo app is not deployed as a production service.

## Create the regression branch

After committing the passing Day 1 demo app on `main`, create the regression branch. If this directory has not been initialized as a git repository yet, initialize it and make the first `main` commit before running these commands.

```bash
git checkout -b regression-discount-bug
```

Edit `apps/demo-app/src/app/api/discount/apply/route.ts` so the invalid discount path returns HTTP 500 instead of HTTP 400:

```ts
return NextResponse.json(
  { error: "Discount service failed" },
  { status: 500 },
);
```

Verify the regression makes the invalid discount test fail:

```bash
npm test
```

Then commit the regression branch:

```bash
git add apps/demo-app/src/app/api/discount/apply/route.ts
git commit -m "Introduce discount regression"
git checkout main
```
