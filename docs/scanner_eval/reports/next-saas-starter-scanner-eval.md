# Scanner Eval: next-saas-starter

Source: `https://github.com/leerob/next-saas-starter`
Snapshot commit: `6e33e58`

## Result

| Metric | Value |
|---|---:|
| Framework detected | `nextjs_app_router_typescript` |
| Supported | yes |
| Scanned files | 41 |
| Detected routes | 8 |
| Detected APIs | 4 |
| Detected test nodes | 0 |
| Detected frontend-to-API callsites | 4 |
| Resolved callsites | 4 |
| Unresolved callsites | 0 |
| Unresolved rate | 0.0% |

## Detected Routes

- `route_dashboard_activity`: `/dashboard/activity`
- `route_dashboard_general`: `/dashboard/general`
- `route_dashboard`: `/dashboard`
- `route_dashboard_security`: `/dashboard/security`
- `route_root`: `/`
- `route_pricing`: `/pricing`
- `route_sign_in`: `/sign-in`
- `route_sign_up`: `/sign-up`

## Detected APIs

- `api_checkout_stripe`: `GET /api/stripe/checkout`
- `api_webhook_stripe`: `POST /api/stripe/webhook`
- `api_team`: `GET /api/team`
- `api_user`: `GET /api/user`

## Resolved Callsites

- `route_dashboard_general` consumes `api_user` at `app/(dashboard)/dashboard/general/page.tsx:65` (`swr_fetcher_literal`)
- `route_dashboard` consumes `api_team` at `app/(dashboard)/dashboard/page.tsx:41` (`swr_fetcher_literal`)
- `route_dashboard` consumes `api_team` at `app/(dashboard)/dashboard/page.tsx:97` (`swr_fetcher_literal`)
- `route_dashboard` consumes `api_user` at `app/(dashboard)/dashboard/page.tsx:191` (`swr_fetcher_literal`)

## Unresolved Callsites

- None

## Top Unresolved Patterns

- None

## Suggested Overrides

- None generated.

## Notes

v0.4 resolves the simple local `fetcher(url)` wrapper pattern used with
`useSWR<T>("/api/...", fetcher)`. This repo now exercises route/API dependency
coverage instead of only route and API node detection.
