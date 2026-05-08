# ReleaseGuard CLI

ReleaseGuard is a PR-aware merge impact coverage gate.

```text
CI tells you tests passed. ReleaseGuard tells you whether the thing this PR actually changed was tested.
```

This package provides the `releaseguard` CLI. The current external usage path is
local packaging:

```bash
npm run build --workspace releaseguard
cd packages/releaseguard
npm pack
```

Install the generated tarball in another repository:

```bash
npm install --save-dev /path/to/releaseguard-0.7.3.tgz
npx releaseguard scanner eval --repo-root .
```

Run reports write both Markdown and static HTML artifacts under
`artifacts/releaseguard/<run_id>/`.

See the repository-level `docs/external_quickstart.md` for the full external
quickstart and GitHub Actions preview template.
