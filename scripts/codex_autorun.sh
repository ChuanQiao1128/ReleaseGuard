#!/usr/bin/env bash
set -euo pipefail

MAX_ROUNDS="${MAX_ROUNDS:-1}"
TASK_QUEUE="${TASK_QUEUE:-codex_tasks/TASK_QUEUE.md}"
STATUS_FILE="${STATUS_FILE:-AUTORUN_STATUS.md}"

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: codex CLI not found."
  echo "Install/configure Codex CLI first, or run these tasks manually in Codex."
  exit 1
fi

if [ ! -f "AGENTS.md" ]; then
  echo "ERROR: AGENTS.md not found. Run from repo root."
  exit 1
fi

if [ ! -f "$TASK_QUEUE" ]; then
  echo "ERROR: $TASK_QUEUE not found."
  exit 1
fi

touch "$STATUS_FILE"
{
  echo "== Codex autorun started =="
  date
} | tee -a "$STATUS_FILE"

for round in $(seq 1 "$MAX_ROUNDS"); do
  {
    echo ""
    echo "== Round $round / $MAX_ROUNDS =="
    date
  } | tee -a "$STATUS_FILE"

  if git diff --quiet && git diff --cached --quiet; then
    echo "Working tree clean before Codex round." | tee -a "$STATUS_FILE"
  else
    echo "ERROR: working tree is not clean before Codex round." | tee -a "$STATUS_FILE"
    echo "Commit/stash/review changes before continuing."
    exit 1
  fi

  PROMPT=$(cat <<EOF
Read AGENTS.md first.
You are running ReleaseGuard controlled autorun.
Read:
- $TASK_QUEUE
- $STATUS_FILE
- README.md
- V0_1_STATUS.md
- V0_2_STATUS.md
- V0_3_STATUS.md if present
- V0_4_STATUS.md if present

Implement the next incomplete task from $TASK_QUEUE only.

Hard rules:
- Do not expand scope.
- Do not implement future version features unless the current task explicitly says so.
- Do not add Playwright, OpenAPI diff, generated tests, GitHub App, OAuth, PR comments, dashboard, pgvector, or live GitHub sync unless the current task explicitly requires it.
- RAG must not directly decide PASS/WARN/BLOCK.
- Decision Engine remains deterministic.
- Agents must not output merge decisions.
- After finishing the task, update $STATUS_FILE with:
  - task completed
  - files changed
  - tests run
  - limitations
  - next suggested task
- Stop after one task.
EOF
)

  echo "Running Codex for one task..." | tee -a "$STATUS_FILE"
  codex exec "$PROMPT"

  echo "Running verification..." | tee -a "$STATUS_FILE"
  ./scripts/verify_releaseguard.sh
  echo "Verification passed after round $round." | tee -a "$STATUS_FILE"

  if git diff --quiet && git diff --cached --quiet; then
    echo "No changes produced by Codex in this round. Stopping." | tee -a "$STATUS_FILE"
    exit 0
  fi

  {
    echo "Changes detected. Current git status:"
    git status --short
    echo ""
    echo "Round $round completed. Review or commit changes before the next autorun round."
    echo "Stopping intentionally to avoid unreviewed multi-task drift."
  } | tee -a "$STATUS_FILE"
  exit 0
done

echo "== Codex autorun reached max rounds ==" | tee -a "$STATUS_FILE"
