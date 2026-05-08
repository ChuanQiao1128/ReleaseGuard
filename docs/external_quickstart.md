# External Repository Quickstart

ReleaseGuard can be tried in another repository with a local npm package.
This is a preview workflow for evaluation and portfolio demos; it is not a
published npm release and it is not a GitHub App.

## 1. Build and pack ReleaseGuard

From the ReleaseGuard repository:

```bash
npm run build --workspace releaseguard
cd packages/releaseguard
npm pack
```

This creates a tarball such as:

```text
releaseguard-0.7.3.tgz
```

## 2. Install in another repository

From the target repository:

```bash
npm install --save-dev /path/to/ReleaseGuard/packages/releaseguard/releaseguard-0.7.3.tgz
```

Then run:

```bash
npx releaseguard --help
```

## 3. Run scanner eval

Use `--repo-root` to make the target repository explicit:

```bash
npx releaseguard scanner eval --repo-root .
```

This writes scanner artifacts under the target repository:

```text
.releaseguard/scanner_eval/<repo_name>/scanner_eval_report.md
.releaseguard/scanner_eval/<repo_name>/capability_graph.json
.releaseguard/scanner_eval/<repo_name>/unresolved_report.json
```

Unsupported frameworks do not crash. ReleaseGuard reports universal
file/module/package impact and fail-safe limitations.

## 4. Run real diff mode

For a pull request branch with local git refs:

```bash
npx releaseguard run --repo-root . --base main --head HEAD
```

For GitHub Actions, use base/head SHAs from the pull request event.

## 5. Run memory index

Repo Memory RAG is local and deterministic by default:

```bash
npx releaseguard memory index --repo-root .
```

This writes:

```text
.releaseguard/memory_chunks.json
```

## 6. Run coverage ingest

LCOV:

```bash
npx releaseguard coverage ingest --repo-root . --file coverage/lcov.info
```

Cobertura:

```bash
npx releaseguard coverage ingest --repo-root . --file coverage/cobertura.xml
```

Coverage is supplemental evidence. It can show that a file was executed by a
test suite, but it does not prove a specific business case was asserted.

## 7. GitHub Actions preview

Copy [github_action_template.yml](github_action_template.yml) into the target
repository as:

```text
.github/workflows/releaseguard-preview.yml
```

The template runs ReleaseGuard as a non-blocking preview and uploads
`.releaseguard` / `artifacts/releaseguard` artifacts if they exist.

## Current limitations

- Supported framework scanners are still limited.
- Unsupported source changes fail safe with `WARN`.
- Coverage evidence is supplemental and does not satisfy case-level evidence.
- RAG is report/context only unless the trusted evidence-priority path is
  explicitly used by a ReleaseGuard run.
- There is no Playwright browser runner yet.
- There is no GitHub App, OAuth flow, dashboard, or PR comment bot yet.
- `BLOCK` / `WARN` / `PASS` semantics are deterministic and unchanged by this
  quickstart.

