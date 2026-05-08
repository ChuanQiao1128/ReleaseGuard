# ReleaseGuard

**Know what your AI just changed — before you push.**

> **Latest — v0.7.7**: Vite + React Router scanner with route → API import graph traversal, plus an *evidence floor* rule that stops zero-test projects from getting misleading `PASS` on every change. Validated on a production Vite + React 19 + React Router 7 SaaS frontend: scanner went from 100% unresolved → **7.8% unresolved**, evidence floor surfaces 15 affected capabilities on a single API-wrapper change. [See change log](docs/VERSIONS.md).

AI assistants generate pull requests faster than reviewers can read them. The integration tests you have were written for last quarter's code. CI says green. Then `/checkout` breaks in production.

ReleaseGuard sits between `git push` and `merge` and answers three questions your test runner cannot:

1. What did this PR actually affect? Not the diff — the user-facing capabilities downstream of it.
2. Are those affected capabilities covered by tests, coverage, or declared evidence?
3. Has anything in this area broken before?

It outputs a deterministic `PASS` / `WARN` / `BLOCK` decision and a reviewer-facing report. Use it locally before you open a PR, or wire it into GitHub Actions so reviewers see it on every PR.

```text
git diff  →  capability graph  →  evidence plan  →  test execution
                  +
            repo memory (ADRs, incidents, reports)
                  ↓
       PASS  /  WARN  /  BLOCK   +   markdown + HTML report
```

ReleaseGuard does not replace your tests, your reviewer, or your CI. It tells reviewers where to look first when they have ten AI-generated PRs to review and twenty minutes.

## What a report looks like

A real run on a discount API change with checkout in its blast radius:

```text
Decision: WARN
Reason: trusted repo memory raised evidence requirement,
        but required browser evidence is missing.

Changed files:
  apps/web/src/app/api/discount/apply/route.ts

Affected capabilities:
  api_apply_discount   POST /api/discount/apply
  route_checkout       /checkout

Selected evidence:
  tests/api/discount.test.ts → PASS  (invalid_discount, 400, error_status)

Historical risk context:
  ADR 0007: Checkout Critical Flow
  2024-08 Discount Validation Crash

Missing evidence:
  browser_smoke /checkout
```

Reviewers see a short summary and a link. Developers running locally get the same report at `artifacts/releaseguard/<run_id>/report.md` and `report.html`.

Sample reports for `BLOCK`, `WARN`, and `PASS` cases are committed under [docs/sample_reports](docs/sample_reports/README.md).

## 30-second quickstart

ReleaseGuard ships as a Node CLI today. Until the npm release lands, use the repo directly:

```bash
git clone https://github.com/ChuanQiao1128/ReleaseGuard
cd ReleaseGuard
npm install
npm run build --workspace releaseguard

# Run the three demo fixtures end-to-end
npm run releaseguard:selfcheck
```

You should see one `BLOCK`, one `WARN`, and one `PASS`, each with a generated report under `artifacts/releaseguard/<run_id>/`.

To run on a real diff inside this repo:

```bash
npm run releaseguard -- run --base main --head HEAD
```

## Use it on your own repo

Two options today, with a third coming after the npm release.

**Option A — install from a packed tarball (works now):**

```bash
# In the ReleaseGuard repo
npm run build --workspace releaseguard
cd packages/releaseguard
npm pack
# → produces releaseguard-0.7.7.tgz

# In your project
npm install --save-dev /path/to/releaseguard-0.7.7.tgz
npx releaseguard scanner eval --repo-root .
npx releaseguard run --repo-root . --base main --head HEAD
```

The `scanner eval` command is the recommended first step on a new repo: it tells you what ReleaseGuard can and cannot infer about your code before you trust its decisions. See [docs/external_quickstart.md](docs/external_quickstart.md) for the full external setup.

**Option B — GitHub Actions preview (works now, advisory only):**

Drop the template at [docs/github_action_template.yml](docs/github_action_template.yml) into `.github/workflows/`. It runs on `pull_request`, calls `releaseguard run` against the PR's base and head SHAs, and uploads the report as an artifact. It does not block merges yet — it's intentionally non-blocking until you've watched it for a couple of weeks.

**Option C — `npx releaseguard` and a published GitHub Action:** coming next. Not yet available on the npm registry.

## What's different from your existing CI

| Tool | Question it answers |
|---|---|
| Unit / integration tests | Does the code behave correctly? |
| Linter / type checker | Is the code well-formed? |
| Codecov / Coveralls | What % of lines were executed? |
| **ReleaseGuard** | **What did this PR actually affect, and is that affected scope covered by evidence I can show a reviewer?** |

ReleaseGuard reads the diff, walks the capability graph downstream of the changed files, asks whether each affected capability has trusted evidence (passing test, declared coverage, file-level coverage, or RAG-flagged historical context), and only then decides. A passing test on an unrelated capability does not count. A green CI on a route that was never executed does not count.

## Status

This is a preview. The CLI works end-to-end and is dogfooded against itself in CI. Honest scope:

| Area | Status |
|---|---|
| CLI: `run`, `scanner eval`, `coverage ingest`, `memory` | Working |
| `PASS` / `WARN` / `BLOCK` decision engine | Working, deterministic |
| Next.js App Router + TypeScript scanner | Working — file routes, route handlers, fetch literals, endpoint constants, fetcher/SWR wrappers |
| Vite + React Router scanner | Working — JSX `<Route>`, `createBrowserRouter` / `useRoutes`, axios direct + `axios.create()` clients (cross-file), TanStack Query `queryFn`, route → API import graph |
| Universal fallback (any framework) | Working — file/module/package fail-safe `WARN` for unmapped source |
| Coverage ingestion | LCOV and Cobertura |
| Repo memory (RAG: BM25 + embeddings + RRF + abstention) | Working, report-only and evidence-priority modes |
| Evidence floor (no-test capabilities → `WARN`) | Working — added v0.7.7 |
| Markdown + HTML reports | Working |
| GitHub Actions template | Available, advisory-only |
| Published npm package | Not yet |
| Reusable `action.yml` for Marketplace | Not yet |
| GitHub App with PR comments and check enforcement | Not yet |
| Team dashboard | Not yet |

**Real-world validation.** Tested on a production Vite + React 19 + React Router 7 + axios + TanStack Query SaaS frontend (recallsmith). Starting from `unsupported_framework` 100% unresolved, the v0.7.x adapter pulled it to 10 routes / 8 outbound APIs / **71 resolved callsites / 7.8% unresolved rate**. The evidence floor correctly identifies that all 15 affected capabilities on a single API-wrapper change have **zero verification infrastructure** (no tests, no coverage, no declarations) and surfaces this to reviewers instead of returning a misleading `PASS`.

If your repo is not Next.js or Vite + React Router, the universal fallback still gives a fail-safe `WARN` for unmapped source changes — it will not silently `PASS`. See [docs/scanner_eval/summary.md](docs/scanner_eval/summary.md) for what the scanner has been measured to handle on real OSS repos.

## How it works

ReleaseGuard is built around four ideas:

**Capability graph.** A static map of routes, APIs, tests, and the call edges between them, built by scanning your repo. The diff is mapped onto this graph to compute *affected capabilities*, not just affected files.

**Evidence plan.** For each affected capability, ReleaseGuard knows what kinds of evidence would prove it works: a passing API test with the right tags, a declared `@releaseguard:covers` annotation, file-level coverage from your existing coverage report, or a browser smoke. The plan lists what's required and what's missing.

**Repo memory (RAG).** ADRs, incident write-ups, and prior ReleaseGuard reports are indexed into a local memory corpus with BM25 + embedding hybrid retrieval and an abstention guard. Memory cannot decide merge outcome — it can only *raise* evidence requirements when trusted historical context is found. RAG never lowers requirements and never overrides the decision engine.

**Deterministic decision engine.** Given the affected capabilities, evidence plan, test results, and historical risk context, the decision is computed by deterministic rules — not by an LLM. This is the central design constraint: agents and RAG inform priority; they do not own the outcome.

For the full design rationale, anti-patterns, and what RAG is *not* allowed to do, see [AGENTS.md](AGENTS.md).

## Project layout

```text
.
├── apps/demo-app/                  # Next.js 14 demo used by fixtures and self-check
├── packages/releaseguard/          # The CLI and core engine
│   ├── src/                        # Scanner, evidence planner, decision, RAG, reports
│   ├── fixtures/                   # Demo PRs for BLOCK / WARN / PASS
│   └── tests/                      # Vitest suite — 90+ tests across scanner, decision, evidence, RAG
├── docs/
│   ├── sample_reports/             # Example reports for each decision class
│   ├── scanner_eval/               # Scanner accuracy measurements on real repos
│   ├── external_quickstart.md      # Use ReleaseGuard in your own repo
│   ├── github_action_template.yml  # GitHub Actions template
│   └── VERSIONS.md                 # Long-form v0.1 → v0.7 release history
├── AGENTS.md                       # Design doc, principles, anti-patterns
├── LICENSE                         # MIT
└── README.md                       # ← you are here
```

## Documentation

| Doc | What's in it |
|---|---|
| [AGENTS.md](AGENTS.md) | Full design doc — principles, what RAG can and can't do, anti-patterns |
| [docs/VERSIONS.md](docs/VERSIONS.md) | Release-by-release narrative from v0.1 through v0.7 |
| [docs/external_quickstart.md](docs/external_quickstart.md) | Step-by-step setup in another repo |
| [docs/github_action_template.yml](docs/github_action_template.yml) | Drop-in GitHub Actions workflow |
| [docs/sample_reports/README.md](docs/sample_reports/README.md) | Sample reports for `BLOCK`, `WARN`, `PASS` |
| [docs/scanner_eval/summary.md](docs/scanner_eval/summary.md) | Honest measurement of scanner accuracy on real OSS repos |

## Roadmap

Short-term (next):

- Publish the CLI to npm so `npx releaseguard run` works without cloning.
- Ship a reusable `action.yml` so teams can use `uses: ChuanQiao1128/ReleaseGuard@v1`.
- Author a real GitHub App that posts a PR comment summary and links to the artifact.

Medium-term:

- More framework adapters (Fastify, Express, Remix, FastAPI).
- Browser smoke executor (Playwright) so `WARN` due to missing browser evidence can be auto-resolved.
- Pre-push hook (`releaseguard install-hook`) and watch mode for tighter inner-loop feedback.

Longer-term:

- Team dashboard: WARN trends, capability heatmap, dismissed-warning incident correlation, AI-PR risk analytics.

## Contributing

This is a preview project being shaped in public. Issues, repro cases on real repos, and scanner adapter contributions are welcome. The design constraints in [AGENTS.md](AGENTS.md) are load-bearing — please read them before proposing changes that touch the decision engine, evidence planner, or RAG layer.

## License

MIT — see [LICENSE](LICENSE).
