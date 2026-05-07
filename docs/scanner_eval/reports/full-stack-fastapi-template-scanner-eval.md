# Scanner Eval: full-stack-fastapi-template

Source: `https://github.com/tiangolo/full-stack-fastapi-template`
Snapshot commit: `13652b5`

## Result

| Metric | Value |
|---|---:|
| Framework detected | `unsupported_framework` |
| Supported | no |
| Scanned files | 0 |
| Detected routes | 0 |
| Detected APIs | 0 |
| Detected test nodes | 0 |
| Detected frontend-to-API callsites | 1 unsupported-framework marker |
| Resolved callsites | 0 |
| Unresolved callsites | 1 |
| Unresolved rate | 100.0% |

## File Role Counts

- `config`: 12
- `docs`: 8
- `source`: 111
- `test`: 30
- `unknown`: 72

## Resolution Level Distribution

- `L0_CHANGED_FILE_ONLY`: 233
- `L1_MODULE_MAPPED`: 4
- `L2_CONTRACT_MAPPED`: 0
- `L3_FRAMEWORK_CAPABILITY_MAPPED`: 0
- `L4_TEST_EVIDENCE_MAPPED`: 0
- `L5_DECLARED_CAPABILITY_MAPPED`: 0

## Detected Routes

- None

## Detected APIs

- None

## Resolved Callsites

- None

## Unresolved Callsites

- `unsupported_framework`: repository is a FastAPI/backend template outside the
  current Next.js App Router scanner scope.

## Top Unresolved Patterns

- `unsupported_framework`: 1

## Suggested Overrides

- None generated.

## Notes

The scanner eval command correctly fails safe for unsupported frameworks by
producing an explicit report instead of crashing or pretending the repo is
covered. v0.5 still records universal file/module/package context for this
repo, but FastAPI route/API precision would require a separate backend adapter
rather than small tweaks to the current Next.js scanner.
