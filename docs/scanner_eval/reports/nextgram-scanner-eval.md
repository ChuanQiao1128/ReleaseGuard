# Scanner Eval: nextgram

Source: `https://github.com/vercel/nextgram`
Snapshot commit: `e74b346`

## Result

| Metric | Value |
|---|---:|
| Framework detected | `nextjs_app_router_typescript` |
| Supported | yes |
| Scanned files | 7 |
| Detected routes | 3 |
| Detected APIs | 0 |
| Detected test nodes | 0 |
| Detected frontend-to-API callsites | 0 |
| Resolved callsites | 0 |
| Unresolved callsites | 0 |
| Unresolved rate | 0.0% |

## File Role Counts

- `config`: 2
- `docs`: 1
- `source`: 7
- `unknown`: 3

## Resolution Level Distribution

- `L0_CHANGED_FILE_ONLY`: 13
- `L1_MODULE_MAPPED`: 1
- `L2_CONTRACT_MAPPED`: 0
- `L3_FRAMEWORK_CAPABILITY_MAPPED`: 3
- `L4_TEST_EVIDENCE_MAPPED`: 0
- `L5_DECLARED_CAPABILITY_MAPPED`: 0

## Detected Routes

- `route_modal_id`: `/@modal/[id]`
- `route_root`: `/`
- `route_photos_id`: `/photos/[id]`

## Detected APIs

- None

## Resolved Callsites

- None

## Unresolved Callsites

- None

## Top Unresolved Patterns

- None

## Suggested Overrides

- None generated.

## Notes

This repo is useful as a route-only App Router smoke test. It validates route
detection but does not exercise API route or frontend-to-API dependency
coverage.
