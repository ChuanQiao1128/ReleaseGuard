# ReleaseGuard Report

Decision: WARN

## Changed files
Fixture: demo-rag-elevated-evidence
- apps/demo-app/src/app/api/discount/apply/route.ts

## Affected capabilities
- api_apply_discount: POST /api/discount/apply (api)
- route_checkout: /checkout (route)

## Selected evidence
- test_api_discount_invalid: tests/api/discount.test.ts for api_apply_discount (invalid_discount, error_status, 400)

## Historical risk context
- hrc_4e89e7de4c34: accepted require_browser_smoke for api_apply_discount, route_checkout (mem_4fbd4a8a435e3d40, mem_505ba72c90a1ec12, mem_6b6bc232b387ee67, mem_7daf07a17369b434, mem_ae47dc886f688e0f, mem_bece124ffd4a4e4e, mem_e5634b3427122d62, mem_e8d5320e221a7a49) - Trusted repo memory retrieved ADR 0007: Checkout Critical Flow; 2024-08 Discount Validation Crash and links checkout critical-flow policy with historical discount validation failures.

## Missing evidence
- route_checkout: trusted repo memory raised evidence requirement, but required browser evidence is missing. (browser_smoke target=/checkout source_context=hrc_4e89e7de4c34)

## Coverage evidence
- No coverage report provided.

## Test results
- tests/api/discount.test.ts: PASSED (exit 0, <duration>ms)

## Decision rationale
- trusted repo memory raised evidence requirement, but required browser evidence is missing.

## Scanner coverage
- Capability graph: .releaseguard/capability_graph.json
- Coverage report: .releaseguard/coverage_report.md

## Artifacts
- Report directory: artifacts/releaseguard/RUN_ID
- Evidence result: artifacts/releaseguard/RUN_ID/evidence_result.json
- Test results: artifacts/releaseguard/RUN_ID/test_results.json
