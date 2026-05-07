# ReleaseGuard v0.4 Completion Plan

v0.4 closes the scanner-first checkpoint created by the real repo scanner eval.

## Decision

Next implementation after v0.4 can be a narrow Playwright/browser smoke pilot
for supported Next.js repos, but scanner eval must remain the gate before
browser execution is trusted.

Reason:
- v0.3.2 showed the highest-risk scanner gap in a supported real repo:
  SWR/local fetcher calls were unresolved.
- v0.4 resolves that specific pattern and reduces
  `leerob/next-saas-starter` from `100.0%` unresolved callsites to `0.0%` on
  the current scanner eval pack.
- The scanner still has known gaps, so browser execution should be piloted only
  when scanner eval reports acceptable route/API coverage for the target repo.

## Recommended Next Milestone

### Option A - Scanner Coverage Expansion

Choose this if new real repo eval reports show unresolved rate above `20%` for
supported Next.js repositories.

Milestones:
- Resolve imported flat endpoint constants.
- Add common axios wrapper classification and override suggestions.
- Improve route context tracing through shared client components.

Acceptance:
- Scanner eval reports show improved unresolved rate.
- Unsupported patterns remain explicit instead of silently passing.
- No PASS/WARN/BLOCK semantic changes.

### Option B - Playwright Browser Smoke Pilot

Choose this for a narrow supported Next.js demo only after scanner eval shows
the affected route/API mapping is explainable.

Milestones:
- Add a `browser_smoke` executor for `/checkout` only.
- Wire it to the existing v0.3 `browser_smoke` evidence requirement.
- Keep generated tests and self-healing out of scope.

Acceptance:
- `demo-rag-elevated-evidence` can select browser evidence when configured.
- Browser evidence result is captured as an artifact.
- Decision Engine remains deterministic and evidence-result driven.

### Option C - Evidence Declaration Expansion

Choose this if scanner eval shows test/evidence mapping is the larger source of
uncertainty than route/API scanning.

Milestones:
- Expand `@releaseguard:covers` documentation.
- Support declaration validation reports.
- Add suggested annotations for ambiguous tests.

Acceptance:
- Declared evidence is graph-validated.
- Unknown capability IDs are rejected.
- Declarations cannot lower requirements or set decisions.

## Current Recommendation

Start with a narrow Playwright/browser smoke pilot only for the demo checkout
flow, while continuing scanner eval on every new target repo. If the next real
repo pack exposes unresolved route/API mapping above `20%`, pause browser work
and return to scanner coverage expansion.
