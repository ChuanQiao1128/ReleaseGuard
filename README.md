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

Run against an explicit repository root:

```bash
npm run releaseguard -- scanner eval --repo-root .
npm run releaseguard -- run --repo-root . --base main --head HEAD
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

## Reports

Each ReleaseGuard run writes a reviewer-facing report artifact:

```text
artifacts/releaseguard/<run_id>/report.md
artifacts/releaseguard/<run_id>/report.html
```

The Markdown report is optimized for CLI and GitHub Actions artifacts. The HTML report is a static file with the same merge-safety content: decision, changed files, affected capabilities, selected evidence, missing evidence, historical risk context, coverage evidence, scanner coverage, and artifact links. It is not a dashboard and does not change `PASS` / `WARN` / `BLOCK` semantics.

Sample reports are committed under [docs/sample_reports](docs/sample_reports/README.md):

- [BLOCK: discount regression](docs/sample_reports/block-discount-regression/report.md)
- [WARN: missing evidence](docs/sample_reports/warn-missing-evidence/report.md)
- [PASS: docs-only](docs/sample_reports/pass-docs-only/report.md)
- [WARN: RAG-elevated evidence](docs/sample_reports/warn-rag-elevated-evidence/report.md)
- [WARN: coverage supplemental evidence](docs/sample_reports/warn-coverage-supplemental/report.md)

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
- Markdown and static HTML reports under `artifacts/releaseguard/<run_id>/`.
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

Current demo-corpus benchmark:

```text
Memory chunks: 46
Queries: 18
No-answer queries: 5

BM25: Recall@5=0.923, MRR=0.346, no-answer FPR=0.800
Embedding: Recall@5=0.692, MRR=0.310, no-answer FPR=1.000
RRF hybrid: Recall@5=0.923, MRR=0.390, no-answer FPR=1.000
Guarded RRF hybrid: Recall@5=0.846, MRR=0.364, no-answer FPR=0.000, no-answer abstention=1.000
Capability-aware guarded RRF hybrid: Recall@5=0.923, MRR=0.390, no-answer FPR=0.000, no-answer abstention=1.000
```

BM25 is strong in this repo-memory corpus because many relevant documents
contain exact domain terms such as `discount`, `checkout`, `ADR`, `incident`,
and API names. The RRF hybrid retriever improves ranking quality through higher
MRR, but v0.2 does not claim embedding-only retrieval is superior.

The default embedding provider is deterministic and local so the benchmark can
run in CI without external API keys. It is useful for testing retrieval
plumbing and evaluation, not a claim that local token hashing matches
production-grade semantic embeddings. A production embedding provider can be
added later behind an explicit configuration boundary.

v0.2.2 adds retrieval abstention. Raw embedding and raw RRF retrieval can still
force context onto no-answer queries, so the guarded retriever can return
`NO_RELEVANT_CONTEXT` instead of returning unrelated chunks. This matters before
v0.3 because no-answer handling is required before RAG context can safely
influence evidence priority.

v0.2.3 makes the abstention tradeoff explicit. In the current demo benchmark,
guarded RRF correctly abstains on all 5 no-answer queries and false-abstains on
2 of 13 answerable queries (`false_abstention_rate=0.154`). The report lists
those query examples and the thresholds used by the guard so future tuning can
reduce recall loss without hiding no-answer failures.

v0.2.4 calibrates abstention with Capability Graph metadata. For task-context
queries tied to `api_apply_discount` and `route_checkout`, ReleaseGuard expands
the retrieval query with deterministic capability aliases such as
`invalid discount`, `checkout`, `cart total`, `critical flow`, `ADR`, and
`incident`. This reduces the guarded retriever's false abstentions from `2` to
`0` in the demo benchmark while keeping no-answer FPR at `0.000`. The expansion
is retrieval-only; it does not alter the Capability Graph, Evidence Planner, or
Decision Engine.

Try guarded memory search:

```bash
npm run releaseguard -- memory search --query "How do we handle WebSocket reconnection?"
# Decision: NO_RELEVANT_CONTEXT

npm run releaseguard -- memory search --query "discount checkout crash"
# Decision: HAS_RELEVANT_CONTEXT
```

Generate the discount/checkout repo-memory demo report:

```bash
npm run releaseguard -- memory demo-discount-context
```

This writes:

```text
.releaseguard/reports/rag_demo_discount_context.md
```

The demo retrieves the checkout critical ADR and the historical discount crash
incident from a noisy repo-memory corpus. v0.2 only reports this context; v0.3
may use trusted historical context to raise evidence priority, with safeguards
that prevent RAG from lowering requirements or deciding merge status.

v0.2 supports deterministic local repo-memory retrieval:

- capability tagging for chunks using graph-backed file paths and conservative keywords,
- BM25 baseline retrieval,
- deterministic local embedding baseline,
- Reciprocal Rank Fusion hybrid retrieval with `k=60`,
- guarded RRF retrieval with deterministic abstention,
- capability-aware guarded retrieval for graph-provided task context,
- source trust tiers and current-PR document self-immunity hooks,
- memory chunk citation validation,
- deterministic retrieval eval dataset generation,
- benchmark reports with Recall@5, MRR, no-answer false positive rate, and abstention rate,
- a discount/checkout demo showing historical ADR and incident context from a noisy local docs corpus.

v0.2 RAG is report-only. It does not affect evidence planning, does not lower evidence requirements, and does not change `PASS` / `WARN` / `BLOCK` decisions. v0.3 may use trusted memory to inform evidence priority, but only with trust safeguards and deterministic decision ownership.

v0.2 does not support pgvector, live GitHub issue/PR sync, reranking, arbitrary CI log ingestion, PR comments, GitHub App/OAuth, generated tests, Playwright browser flows, OpenAPI diff, or dashboards.

## v0.3 RAG-informed Evidence Priority

v0.3 lets trusted repo memory raise evidence priority in the conservative
direction only.

```text
Capability Graph -> affected capabilities
Repo Memory RAG -> validated historical risk context
Evidence Planner -> added required evidence
Decision Engine -> deterministic PASS/WARN/BLOCK
```

RAG still cannot directly decide merge outcome. It cannot lower evidence
requirements, cannot mark evidence as passed, cannot change capability risk,
and current-PR modified docs cannot justify current-run evidence priority.

Run the v0.3 demo:

```bash
npm run releaseguard -- run --fixture demo-rag-elevated-evidence
# Decision: WARN
# Reason: trusted repo memory raised evidence requirement, but required browser evidence is missing.
```

The fixture simulates a discount API change where existing API evidence passes.
ReleaseGuard then retrieves trusted checkout/discount repo memory:

- `ADR 0007: Checkout Critical Flow`
- `2024-08 Discount Validation Crash`

That validated context adds a missing high-priority `browser_smoke` requirement
for `/checkout`. v0.3 does not implement a browser executor, so the missing
browser evidence produces `WARN`, not `BLOCK`.

## Scanner evaluation before Playwright

Before adding browser execution, ReleaseGuard validates the Capability Graph
scanner itself. The scanner eval command measures what the current scanner can
infer and what it has to leave unresolved.

```bash
npm run releaseguard -- scanner eval --root .
```

This writes:

```text
.releaseguard/scanner_eval/<repo_name>/scanner_eval_report.md
.releaseguard/scanner_eval/<repo_name>/capability_graph.json
.releaseguard/scanner_eval/<repo_name>/unresolved_report.json
```

The report includes:

- framework detected,
- scanned file count,
- detected routes,
- detected APIs,
- detected test nodes,
- resolved and unresolved frontend-to-API callsites,
- unresolved callsite rate,
- top unresolved pattern categories,
- suggested override snippets when ReleaseGuard can infer a likely mapping.

Unsupported repositories do not crash the command. They produce an
`unsupported_framework` report so scanner coverage gaps remain visible.

## Scanner evaluation on real repositories

v0.3.2 applies the scanner eval tooling to external repositories before adding
browser execution. The current reports live under
[docs/scanner_eval](docs/scanner_eval/summary.md).
Those reports are intentionally excluded from repo-memory indexing so scanner
evaluation artifacts do not change the v0.2 RAG benchmark corpus.

Summary:

| Repo | Framework | Supported | Routes | APIs | Resolved | Unresolved | Unresolved rate |
|---|---|---:|---:|---:|---:|---:|---:|
| `leerob/next-saas-starter` | `nextjs_app_router_typescript` | yes | 8 | 4 | 4 | 0 | 0.0% |
| `vercel/nextgram` | `nextjs_app_router_typescript` | yes | 3 | 0 | 0 | 0 | 0.0% |
| `tiangolo/full-stack-fastapi-template` | `unsupported_framework` | no | 0 | 0 | 0 | 1 | 100.0% |

v0.4 resolves the highest-ROI issue from the first supported real app: simple
local `fetcher(url)` wrappers used with `useSWR<T>("/api/...", fetcher)`. It
also adds flat endpoint-constant resolution and an optional evidence declaration
protocol for tests:

```ts
// @releaseguard:covers api_apply_discount invalid_discount 400 error_status
```

Evidence declarations are graph-validated. They can make test coverage more
explicit, but they do not let tests invent capability IDs and they do not let
agents or RAG change `PASS` / `WARN` / `BLOCK`.

## v0.5 Universal Impact Layer

ReleaseGuard is language-agnostic at the diff, file, module/package, evidence,
and decision layers. Framework adapters improve precision where available.

v0.5 adds a universal fallback before framework-specific scanners:

```text
git diff -> file role -> module/package boundary -> framework adapter -> evidence -> decision
```

Resolution levels:

- `L0_CHANGED_FILE_ONLY`
- `L1_MODULE_MAPPED`
- `L2_CONTRACT_MAPPED`
- `L3_FRAMEWORK_CAPABILITY_MAPPED`
- `L4_TEST_EVIDENCE_MAPPED`
- `L5_DECLARED_CAPABILITY_MAPPED`

Unsupported repositories no longer only report `unsupported_framework`. Scanner
eval still marks route/API precision as unsupported, but it also reports file
role counts and module/package fallback context. Unknown source, config, or
dependency changes do not silently pass; they fail safe with `WARN` unless a
more precise adapter, coverage source, declaration, or override can prove the
impact.

v0.5.1 refreshes scanner eval reporting around those impact levels. Reports now
show universal fallback contribution, framework adapter contribution, and
fail-safe implications. This keeps the product claim honest: ReleaseGuard does
not automatically understand every framework, but every repo can get a
minimum safe impact report.

## v0.6 Coverage Ingestion

v0.6 adds coverage ingestion before Playwright because coverage is more
language/framework-agnostic. Browser smoke tests need a reliable affected route;
coverage can already answer a more basic question for many repositories:

```text
Did any test suite execute the changed file?
```

Supported coverage formats in v0.6:

- LCOV (`lcov.info`) for JavaScript/TypeScript coverage tools.
- Cobertura XML for `coverage.py` and generic CI coverage exports.

Ingest a coverage report:

```bash
npm run releaseguard -- coverage ingest --file packages/releaseguard/fixtures/coverage/lcov.info
```

Use coverage in scanner eval:

```bash
npm run releaseguard -- scanner eval --root . --coverage packages/releaseguard/fixtures/coverage/lcov.info
```

Use coverage in run mode:

```bash
npm run releaseguard -- run --base main --head HEAD --coverage coverage/lcov.info
```

Run the supplemental coverage demo:

```bash
npm run releaseguard -- run --fixture demo-coverage-supplemental-evidence --coverage packages/releaseguard/fixtures/coverage/lcov.info
# Decision: WARN
# Reason: source change could not be mapped to known capability.
```

The fixture simulates an unmapped source change. ReleaseGuard still fails safe
with `WARN`, but the report includes file-level coverage evidence so reviewers
can see that the changed file is exercised by tests even though no precise
business capability or case-level evidence was proven.

Coverage evidence is supplemental. It is weaker than declared case evidence and
direct test mapping:

```text
declared_case_evidence > direct_test_mapping > coverage_file_evidence > missing_evidence
```

Coverage can show that a file or line was executed by a test suite. It does not
prove a specific business case was asserted. For example, file coverage for
`POST /api/discount/apply` does not satisfy the required `invalid_discount`
case unless the test scanner or an explicit declaration also proves those tags.

By default, coverage does not make unknown source/config/dependency changes
silently pass. Unsupported source changes with file-level coverage still report
the coverage context and keep fail-safe `WARN` until a stronger mapping,
declaration, contract, or policy proves the impact.

## Try ReleaseGuard in Another Repo

v0.7 adds an external quickstart path using local npm packaging and explicit
`--repo-root` flags. This is a preview workflow for trying ReleaseGuard outside
this repository; it is not an npm registry release.

Build and pack the CLI:

```bash
npm run build --workspace releaseguard
cd packages/releaseguard
npm pack
```

Install the tarball in another repository:

```bash
npm install --save-dev /path/to/releaseguard-0.7.3.tgz
npx releaseguard scanner eval --repo-root .
```

External repo commands:

```bash
npx releaseguard scanner eval --repo-root .
npx releaseguard run --repo-root . --base main --head HEAD
npx releaseguard memory index --repo-root .
npx releaseguard coverage ingest --repo-root . --file coverage/lcov.info
```

See [docs/external_quickstart.md](docs/external_quickstart.md) for the full
quickstart and [docs/github_action_template.yml](docs/github_action_template.yml)
for a non-blocking GitHub Actions preview template.

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
