# ReleaseGuard v0.6 Status

Working scope: Coverage Ingestion.

v0.6 adds coverage report ingestion as the next language/framework-agnostic
evidence layer after v0.5 universal file/module/package impact. It does not add
Playwright, generated tests, OpenAPI diff, GitHub App/OAuth, PR comments, or a
dashboard.

## Done

- Added coverage data models:
  - `CoverageReport`
  - `CoverageRecord`
  - `CoverageEvidence`
- Added LCOV parser for:
  - `SF:`
  - `DA:`
  - `LH:`
  - `LF:`
  - `end_of_record`
- Added Cobertura XML parser for common `coverage.py`-style reports:
  - `class filename`
  - `line number`
  - `line hits`
- Added coverage path normalization relative to repo root.
- Added fixture coverage reports:
  - `packages/releaseguard/fixtures/coverage/lcov.info`
  - `packages/releaseguard/fixtures/coverage/cobertura.xml`
- Added CLI command:
  - `npm run releaseguard -- coverage ingest --file <coverage_file>`
- Added optional scanner eval coverage flag:
  - `npm run releaseguard -- scanner eval --root <repo_path> --coverage <coverage_file>`
- Added optional run mode coverage flag:
  - `npm run releaseguard -- run --base <base> --head <head> --coverage <coverage_file>`
- Updated scanner eval reports to include:
  - coverage provider
  - coverage file counts
  - matched graph files
  - coverage-backed L4 contribution
  - coverage limitation note
- Updated markdown run reports to include coverage evidence.
- Updated Evidence Planner so coverage evidence is supplemental:
  - declared case evidence remains strongest,
  - direct test mapping remains stronger than coverage,
  - coverage file evidence does not satisfy specific case tags.
- Added tests for:
  - LCOV parsing,
  - Cobertura parsing,
  - path normalization,
  - coverage report writing,
  - scanner eval with coverage,
  - run mode with coverage,
  - invalid_discount still missing when only coverage evidence exists.

## v0.6.1 Coverage Supplemental Evidence Demo

Done:

- Added fixture:
  - `demo-coverage-supplemental-evidence`
- The fixture simulates:
  - changed source file: `apps/demo-app/src/lib/unknown-helper.ts`
  - no route/API capability mapping,
  - LCOV file-level coverage evidence,
  - no case-level evidence.
- Updated LCOV fixture to include the supplemental demo file.
- Added tests proving:
  - the fixture outputs `WARN`,
  - coverage evidence appears in the report,
  - coverage limitation text appears in the report,
  - coverage does not satisfy `invalid_discount` case-level evidence,
  - unknown source with coverage does not `PASS`.

Demo command:

```bash
npm run releaseguard -- run --fixture demo-coverage-supplemental-evidence --coverage packages/releaseguard/fixtures/coverage/lcov.info
```

Expected output:

```text
Decision: WARN
Reason: source change could not be mapped to known capability.
```

## Evidence Semantics

Coverage evidence is file/line/suite-level evidence. It can show that tests
executed a file or line. It does not prove that a specific business case was
asserted.

Evidence strength order:

```text
declared_case_evidence > direct_test_mapping > coverage_file_evidence > missing_evidence
```

Default v0.6 behavior remains conservative:

- Coverage does not directly change `PASS` / `WARN` / `BLOCK`.
- Coverage does not satisfy required tags such as `invalid_discount`, `400`, or
  `error_status`.
- Unmapped source/config/dependency changes with coverage still keep fail-safe
  `WARN` unless stronger mapping or policy exists.

## Commands Run

```bash
npm run test --workspace releaseguard -- coverage.test.ts
npm run test --workspace releaseguard -- coverage.test.ts scannerEval.test.ts cli.test.ts
npm run test --workspace releaseguard -- coverage.test.ts coverageIntegration.test.ts decisionReport.test.ts realDiffMode.test.ts
npm run build --workspace releaseguard
npm run releaseguard -- coverage ingest --file packages/releaseguard/fixtures/coverage/lcov.info
npm run releaseguard -- scanner eval --root . --coverage packages/releaseguard/fixtures/coverage/lcov.info
npm run releaseguard -- run --fixture demo-docs-only --coverage packages/releaseguard/fixtures/coverage/lcov.info
npm run releaseguard -- run --fixture demo-rag-elevated-evidence --coverage packages/releaseguard/fixtures/coverage/lcov.info
npm run test --workspace releaseguard
npm run releaseguard -- memory index
npm run releaseguard -- memory benchmark
npm run releaseguard -- memory demo-discount-context
npm run releaseguard -- run --fixture demo-discount-regression
npm run releaseguard -- run --fixture demo-missing-evidence
npm run releaseguard -- run --fixture demo-docs-only
npm run releaseguard -- run --fixture demo-rag-elevated-evidence
npm run releaseguard -- run --fixture demo-coverage-supplemental-evidence --coverage packages/releaseguard/fixtures/coverage/lcov.info
npm test
npm run build --workspace @releaseguard/demo-app
npm run releaseguard:selfcheck
npm run test --workspace @releaseguard/demo-app
git diff --check
```

Final verification result: passed.

## Limitations

- v0.6 reads existing coverage reports; it does not generate coverage.
- v0.6 supports LCOV and Cobertura XML only.
- Coverage-to-test-case attribution is not implemented.
- Coverage evidence is file-level supplemental context, not business-case proof.
- Coverage does not replace evidence declarations or direct test mapping.
- Coverage does not make unsupported source changes pass by default.
- Go coverprofile, JaCoCo XML, SimpleCov, and per-test coverage are future work.

## Next

v0.6 has been merged/tagged as `releaseguard-v0.6`.

Likely next implementation after v0.6.1: coverage-backed real repo eval refresh
or additional coverage providers. Playwright should remain after enough route
and evidence targeting data exists.
