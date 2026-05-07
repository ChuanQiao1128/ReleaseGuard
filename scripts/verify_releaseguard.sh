#!/usr/bin/env bash
set -euo pipefail

echo "== ReleaseGuard verification =="

npm run test --workspace releaseguard
npm run build --workspace releaseguard
npm run releaseguard -- scanner eval --root .
npm run releaseguard -- memory index
npm run releaseguard -- memory benchmark
npm run releaseguard -- memory demo-discount-context
npm run releaseguard -- run --fixture demo-discount-regression
npm run releaseguard -- run --fixture demo-missing-evidence
npm run releaseguard -- run --fixture demo-docs-only
npm run releaseguard -- run --fixture demo-rag-elevated-evidence
npm test
npm run build --workspace @releaseguard/demo-app
npm run releaseguard:selfcheck
npm run test --workspace @releaseguard/demo-app

echo "== ReleaseGuard verification passed =="
