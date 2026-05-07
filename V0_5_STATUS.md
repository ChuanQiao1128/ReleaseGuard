# ReleaseGuard v0.5 Status

Working scope: Universal Impact Layer.

v0.5 makes ReleaseGuard language/framework-agnostic at the diff, file,
module/package, evidence, and deterministic decision layers. Framework scanners
remain precision adapters. Unsupported route/API frameworks fail safe instead
of being treated as covered.

## Universal Scanner Primitives

Status: Done

Done:
- Added `ScannerAdapter`, `SupportResult`, and `CapabilityGraphFragment`
  primitives.
- Added `UniversalFileScanner`:
  - scans files for any repository,
  - classifies file roles: `docs`, `source`, `test`, `config`, `dependency`,
    `generated`, `unknown`,
  - creates file nodes and module membership edges.
- Added `PackageManifestScanner`:
  - detects `package.json`, `pyproject.toml`, `go.mod`, `pom.xml`, and
    Gradle manifests,
  - creates package nodes and manifest definition edges.
- Extended the graph schema with `module`, `package`, and `belongs_to`.

## Resolution Levels

Status: Done

Done:
- Added `ResolutionLevel`:
  - `L0_CHANGED_FILE_ONLY`
  - `L1_MODULE_MAPPED`
  - `L2_CONTRACT_MAPPED`
  - `L3_FRAMEWORK_CAPABILITY_MAPPED`
  - `L4_TEST_EVIDENCE_MAPPED`
  - `L5_DECLARED_CAPABILITY_MAPPED`
- Scanner coverage and scanner eval reports now include resolution level
  distributions.
- Scanner eval reports now include file role counts.

## Impact Resolver

Status: Done

Done:
- Added universal `resolveImpact(...)`.
- Changed source/test/config/dependency files mapped only to L0/L1 fail safe
  with `WARN`.
- Docs-only scopes still fast-pass.
- Next.js demo route/API changes still map to L3+ and use the existing precise
  graph/evidence path.
- Evidence declarations map changed tests to L5.

## Scanner Eval Updates

Status: Done

Done:
- Unsupported repos now still get universal file/module/package graph output.
- `full-stack-fastapi-template` remains unsupported at route/API precision, but
  now reports:
  - 233 scanned files,
  - 111 source files,
  - 30 test files,
  - 4 module/package-level mappings.
- Supported Next.js repos still get precise route/API graph output.

## Commands Run

- `npm run test --workspace releaseguard -- universalImpact.test.ts scannerEval.test.ts realDiffMode.test.ts`
- `npm run build --workspace releaseguard`
- `npm run releaseguard -- scanner eval --root .`
- `npm run releaseguard -- scanner eval --root /tmp/releaseguard-scanner-eval/full-stack-fastapi-template`
- `npm run releaseguard -- scanner eval --root /tmp/releaseguard-scanner-eval/next-saas-starter`
- `npm run releaseguard -- scanner eval --root /tmp/releaseguard-scanner-eval/nextgram`

Full verification must be run before merge:
- `./scripts/verify_releaseguard.sh`

Final verification result:
- `./scripts/verify_releaseguard.sh` passed.
- ReleaseGuard package tests: 20 files, 107 tests passed.
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

- v0.5 does not add coverage ingestion.
- v0.5 does not add FastAPI, Express, GraphQL, OpenAPI, or other new framework
  adapters.
- v0.5 does not add Playwright, generated tests, GitHub App/OAuth, PR comments,
  dashboards, pgvector, or live GitHub sync.
- L2 contract mapping is reserved but not implemented.
- Package/module mapping is conservative and directory/manifest based.

## Next

- v0.6 should add coverage ingestion providers such as LCOV and Cobertura before
  broadening framework adapters.
