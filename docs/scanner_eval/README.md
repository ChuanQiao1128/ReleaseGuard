# Scanner Eval Runbook

ReleaseGuard evaluates scanner coverage before adding browser execution. The
goal is to measure whether the Capability Graph can identify routes, APIs,
tests, and frontend-to-API callsites in repositories beyond the demo app.

## Run Scanner Eval

Clone target repositories outside this repository:

```bash
mkdir -p /tmp/releaseguard-scanner-eval
cd /tmp/releaseguard-scanner-eval
git clone --depth 1 <repo_url>
```

Run scanner eval from the ReleaseGuard repository:

```bash
npm run releaseguard -- scanner eval --root /tmp/releaseguard-scanner-eval/<repo>
```

ReleaseGuard writes local artifacts under:

```text
.releaseguard/scanner_eval/<repo_name>/scanner_eval_report.md
.releaseguard/scanner_eval/<repo_name>/capability_graph.json
.releaseguard/scanner_eval/<repo_name>/unresolved_report.json
```

Copy the relevant report content into `docs/scanner_eval/reports/`. Do not
vendor external repositories into this repository.

## What To Capture

Each report should record:

- repo name and source URL,
- snapshot commit,
- framework detected,
- whether the current scanner supports it,
- routes detected,
- APIs detected,
- test nodes detected,
- frontend-to-API callsites detected,
- resolved callsites,
- unresolved callsites,
- unresolved rate,
- top unresolved patterns,
- suggested override examples,
- scanner limitation notes.

## Decision Thresholds

Use scanner eval to choose the next milestone:

- unresolved rate `<= 20%`: scanner foundation may be good enough for a
  Playwright/browser evidence runner on supported frameworks.
- unresolved rate `> 20%` and `<= 40%`: scanner is usable for preview, but
  scanner coverage and override UX should improve before enforcement.
- unresolved rate `> 40%`: prioritize scanner expansion and override UX before
  browser execution.

## v0.4 Result

The initial v0.3.2 pack showed that `leerob/next-saas-starter` detected routes
and APIs but could not resolve SWR calls hidden behind a local `fetcher(url)`
wrapper. v0.4 adds support for that narrow pattern and for flat endpoint
constants.

Scanner eval reports should continue to record unresolved rates after each
scanner expansion. Browser evidence should only be piloted on framework slices
where the scanner can first explain affected routes and APIs.
