# ReleaseGuard Report

Decision: WARN

## Changed files
Fixture: demo-coverage-supplemental-evidence
- apps/demo-app/src/lib/unknown-helper.ts

## Affected capabilities
- None

## Selected evidence
- None

## Missing evidence
- None

## Coverage evidence
- Provider: lcov
- apps/demo-app/src/lib/unknown-helper.ts: 66.67% line coverage (line_coverage)
- Limitation: coverage shows this file was executed by tests, but does not prove the specific business case was asserted.

## Test results
- None

## Decision rationale
- source change could not be mapped to known capability.

## Scanner coverage
- Capability graph: .releaseguard/capability_graph.json
- Coverage report: .releaseguard/coverage_report.md

## Artifacts
- Report directory: artifacts/releaseguard/RUN_ID
- Evidence result: artifacts/releaseguard/RUN_ID/evidence_result.json
- Test results: artifacts/releaseguard/RUN_ID/test_results.json
