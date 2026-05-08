# ReleaseGuard v0.7 Status

Working scope: External Repo Quickstart and Packaging.

v0.7 makes ReleaseGuard easier to try outside this repository through explicit
`--repo-root` CLI support, local `npm pack`, quickstart documentation, and a
non-blocking GitHub Actions preview template.

## Done

- Merged/tagged v0.6.1:
  - `releaseguard-v0.6.1`
- Added preferred `--repo-root` support while preserving existing commands:
  - `releaseguard scanner eval --repo-root <path>`
  - `releaseguard run --repo-root <path> --base <base> --head <head>`
  - `releaseguard memory index --repo-root <path>`
  - `releaseguard memory benchmark --repo-root <path>`
  - `releaseguard memory demo-discount-context --repo-root <path>`
  - `releaseguard coverage ingest --repo-root <path> --file <coverage_file>`
- Kept `scanner eval --root <path>` for backward compatibility.
- Updated package metadata for local packaging:
  - `description`
  - `license`
  - `files`
  - existing `bin` entry
- Added package README:
  - `packages/releaseguard/README.md`
- Added external quickstart:
  - `docs/external_quickstart.md`
- Added GitHub Actions preview template:
  - `docs/github_action_template.yml`
- Added external smoke script:
  - `scripts/external_smoke_test.sh`

## External Usage

Local package flow:

```bash
npm run build --workspace releaseguard
cd packages/releaseguard
npm pack
```

Install in another repository:

```bash
npm install --save-dev /path/to/releaseguard-0.7.3.tgz
npx releaseguard scanner eval --repo-root .
```

## v0.7.1 Package Polish

Done:

- Updated `packages/releaseguard/package.json` version to `0.7.1`.
- Updated package lock metadata for the workspace package.
- Updated external quickstart docs to reference:
  - `releaseguard-0.7.1.tgz`
- Confirmed the package name remains `releaseguard`.
- Confirmed the CLI bin remains:
  - `releaseguard -> dist/cli.js`

## v0.7.2 HTML Report

Done:

- Added a static HTML report artifact next to the existing Markdown report:
  - `artifacts/releaseguard/<run_id>/report.html`
- Kept `report.md` as the primary CLI/GitHub Actions artifact.
- Updated run mode so docs-only and full analysis runs both write HTML.
- Updated CLI output to print both report paths.
- Added tests for HTML report rendering and artifact generation.
- Hardened run artifact IDs with a short UUID suffix so concurrent runs do not
  overwrite each other's reports.
- Updated package metadata for the local tarball:
  - `releaseguard-0.7.2.tgz`

Limits:

- This is a static report artifact, not a dashboard.
- It does not add PR comments, GitHub App behavior, or hosted UI.
- It does not change `PASS` / `WARN` / `BLOCK` semantics.

## v0.7.3 Sample Report Gallery

Done:

- Added curated sample reports under:
  - `docs/sample_reports/`
- Added samples for:
  - `demo-discount-regression`
  - `demo-missing-evidence`
  - `demo-docs-only`
  - `demo-rag-elevated-evidence`
  - `demo-coverage-supplemental-evidence`
- Added `scripts/generate_sample_reports.sh` to regenerate the gallery from
  current fixture output.
- Sanitized run artifact IDs and test durations in committed samples.
- Excluded `docs/sample_reports` from Repo Memory indexing so showcase artifacts
  do not pollute RAG benchmark corpus.
- Linked the sample gallery from the root README.
- Updated package metadata for the local tarball:
  - `releaseguard-0.7.3.tgz`

Limits:

- The gallery contains static examples, not live run artifacts.
- Raw `artifacts/releaseguard` directories remain ignored.
- v0.7.3 does not add new product behavior or alter decision semantics.

## Limits

- v0.7 does not publish to npm.
- v0.7 does not add Playwright browser flows.
- v0.7 does not add generated tests.
- v0.7 does not add OpenAPI diff.
- v0.7 does not add GitHub App/OAuth, PR comments, or dashboard.
- v0.7 does not change `PASS` / `WARN` / `BLOCK` semantics.
- External GitHub Actions template is advisory/non-blocking.

## Commands Run

```bash
npm run test --workspace releaseguard -- cli.test.ts
npm run test --workspace releaseguard -- cli.test.ts memory.test.ts
npm run test --workspace releaseguard -- memory.test.ts
npm run test --workspace releaseguard
npm run build --workspace releaseguard
npm run releaseguard -- scanner eval --root .
npm run releaseguard -- scanner eval --repo-root .
npm run releaseguard -- coverage ingest --file packages/releaseguard/fixtures/coverage/lcov.info
npm run releaseguard -- coverage ingest --repo-root . --file packages/releaseguard/fixtures/coverage/lcov.info
npm run releaseguard -- scanner eval --root . --coverage packages/releaseguard/fixtures/coverage/lcov.info
npm run releaseguard -- run --fixture demo-coverage-supplemental-evidence --coverage packages/releaseguard/fixtures/coverage/lcov.info
npm run releaseguard -- run --repo-root . --fixture demo-docs-only
npm run releaseguard -- memory index --repo-root .
npm run releaseguard:selfcheck
npm test
npm run build --workspace @releaseguard/demo-app
npm run test --workspace @releaseguard/demo-app
./scripts/generate_sample_reports.sh
cd packages/releaseguard && npm pack
./scripts/external_smoke_test.sh
./scripts/verify_releaseguard.sh
```

Final verification result: passed.

Package output:

```text
releaseguard-0.7.3.tgz
```

External smoke result:

```text
Scanner eval repo: <temp>/target
Framework detected: unsupported_framework
Supported: no
Routes detected: 0
APIs detected: 0
Resolved callsites: 0
Unresolved callsites: 1
Unresolved rate: 100.0%
External smoke test passed
```

## Next

Recommended next milestone:

- v0.8 Playwright Browser Smoke Runner for supported route-level evidence, or
- external pilot evaluation on a few repositories using the v0.7 package flow.
