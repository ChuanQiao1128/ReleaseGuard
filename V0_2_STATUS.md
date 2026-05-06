# ReleaseGuard v0.2 Status

Working scope: Repo Memory RAG only. Graph traversal remains the source of truth
for structured dependencies. RAG is only for unstructured repo memory.

Do not add embeddings, vector search, BM25, RRF, pgvector, GitHub API sync, LLM
tagging, RAG-informed evidence planning, PR comments, Playwright browser flows,
generated tests, OpenAPI diff, benchmark, or dashboard during TASK-RAG-001.

## TASK-RAG-001 - Repo Memory Source Loader + Chunker

Status: Done

Done:
- Created branch `v0.2-rag-memory`.
- Added typed `RepoMemoryChunk` schema.
- Added local markdown source loader for `docs/` and `.releaseguard/reports/`.
- Added markdown heading chunker.
- Added `npm run releaseguard -- memory index` CLI path.
- Added demo memory files for checkout critical-flow ADR and discount crash incident.
- Verified memory indexing writes 10 chunks to `.releaseguard/memory_chunks.json`.

Tests run:
- `npm run test --workspace releaseguard`
- `npm run build --workspace releaseguard`
- `npm run releaseguard -- memory index`
- `npm test`
- `npm run build --workspace @releaseguard/demo-app`
- `npm run releaseguard:selfcheck`
- `npm run test --workspace @releaseguard/demo-app`

Issues:
- None currently.

Next:
- TASK-RAG-002 can add deterministic capability/file tagging. Do not add
  retrieval, embeddings, BM25, RRF, pgvector, or LLM calls until their
  dedicated tasks.
