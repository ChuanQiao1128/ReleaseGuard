#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_ROOT="$REPO_ROOT/docs/sample_reports"
COVERAGE_FIXTURE="packages/releaseguard/fixtures/coverage/lcov.info"

generate_sample() {
  local sample_name="$1"
  shift
  local sample_dir="$OUTPUT_ROOT/$sample_name"
  local output
  mkdir -p "$sample_dir"

  echo "== Generating $sample_name =="
  output="$("$@" 2>&1)"
  echo "$output"

  local markdown_report
  local html_report
  markdown_report="$(awk '/^Report: / {print $2}' <<<"$output" | tail -n 1)"
  html_report="$(awk '/^HTML Report: / {print $3}' <<<"$output" | tail -n 1)"

  if [[ -z "$markdown_report" || -z "$html_report" ]]; then
    echo "ERROR: could not find report paths for $sample_name"
    exit 1
  fi

  cp "$REPO_ROOT/$markdown_report" "$sample_dir/report.md"
  cp "$REPO_ROOT/$html_report" "$sample_dir/report.html"
  sanitize_report "$sample_dir/report.md"
  sanitize_report "$sample_dir/report.html"
}

sanitize_report() {
  local file_path="$1"
  perl -0pi -e 's/artifacts\/releaseguard\/[0-9TZ]+-[a-f0-9]{8}/artifacts\/releaseguard\/RUN_ID/g' "$file_path"
  perl -0pi -e 's/, [0-9]+ms\)/, <duration>ms\)/g' "$file_path"
  perl -0pi -e 's/>[0-9]+ms<\/td>/>&lt;duration&gt;ms<\/td>/g' "$file_path"
}

rm -rf "$OUTPUT_ROOT/block-discount-regression" \
  "$OUTPUT_ROOT/warn-missing-evidence" \
  "$OUTPUT_ROOT/pass-docs-only" \
  "$OUTPUT_ROOT/warn-rag-elevated-evidence" \
  "$OUTPUT_ROOT/warn-coverage-supplemental"

generate_sample \
  "block-discount-regression" \
  npm run releaseguard -- run --fixture demo-discount-regression

generate_sample \
  "warn-missing-evidence" \
  npm run releaseguard -- run --fixture demo-missing-evidence

generate_sample \
  "pass-docs-only" \
  npm run releaseguard -- run --fixture demo-docs-only

generate_sample \
  "warn-rag-elevated-evidence" \
  npm run releaseguard -- run --fixture demo-rag-elevated-evidence

generate_sample \
  "warn-coverage-supplemental" \
  npm run releaseguard -- run --fixture demo-coverage-supplemental-evidence --coverage "$COVERAGE_FIXTURE"

echo "== Sample reports written to docs/sample_reports =="
