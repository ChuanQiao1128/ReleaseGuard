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

It does not support:

- RAG, embeddings, pgvector, or vector search.
- GitHub App, GitHub Actions, OAuth, or webhook integration.
- Generated tests, self-healing tests, or Playwright browser flows.
- OpenAPI diff, contract runners, database migration runners, or dashboards.
- Monorepos beyond this local npm workspace demo.
- Endpoint constants, template literals, axios wrappers, tRPC, GraphQL, generated clients, OpenAPI clients, and dynamic URLs.

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

## Run In CI

ReleaseGuard v0.1.4 includes a minimal GitHub Actions self-check workflow at `.github/workflows/releaseguard.yml`.

The workflow runs on `pull_request` and `workflow_dispatch`. It installs dependencies, builds and tests the workspace, runs all three fixture checks, uploads `artifacts/releaseguard`, and writes a job summary.

This is a fixture self-check, not the real PR diff gate yet. A later milestone will add real PR diff mode or GitHub check integration.

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
