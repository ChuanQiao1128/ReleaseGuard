# ReleaseGuard v0.2 Status

Working scope: Repo Memory RAG only. Graph traversal remains the source of truth
for structured dependencies. RAG is only for unstructured repo memory.

v0.2 may add local retrieval foundations, deterministic eval, and reporting.
It must not add pgvector, GitHub API sync, LLM tagging, RAG-informed evidence
planning, PR comments, Playwright browser flows, generated tests, OpenAPI diff,
OSS replay benchmarks, or dashboard features.

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

## TASK-RAG-002 - Capability Tagger

Status: Done

Done:
- Added deterministic repo memory capability tagging.
- Direct source file path mentions map through the Capability Graph with high
  confidence.
- Conservative keyword matching maps discount and checkout memory to known
  capabilities with medium confidence.
- Chunks with no graph or no match remain unresolved.
- Tagger never emits capability IDs outside the current graph.

Tests run:
- `npm run test --workspace releaseguard -- --run tests/memory.test.ts tests/memoryTagger.test.ts`

Limitations:
- No LLM tagging in v0.2.
- Keyword aliases are intentionally conservative and demo-scoped.

Next milestone:
- Add noisy demo repo memory so retrieval is evaluated against mixed relevant
  and unrelated documents.

## TASK-RAG-003 - Noisy Demo Repo Memory

Status: Done

Done:
- Added unrelated and semi-related ADR, incident, and notes markdown files under
  `docs/`.
- The corpus now includes pagination, payment provider, auth, product image,
  cart quantity, i18n copy, profile preferences, search empty state, support
  escalation, and test-data seeding memory.

Tests run:
- `npm run test --workspace releaseguard -- --run tests/memory.test.ts tests/memoryTagger.test.ts`

Limitations:
- Demo noise is local markdown only; v0.2 still does not sync live GitHub issues
  or PRs.

Next milestone:
- Implement BM25 retrieval baseline.

## TASK-RAG-004 - BM25 Baseline

Status: Done

Done:
- Added a local BM25 retriever over `RepoMemoryChunk` text.
- Supports source type, related capability ID, and tagging status filters.
- Applies temporal decay unless disabled.
- Handles empty queries and empty corpora safely.

Tests run:
- `npm run test --workspace releaseguard -- --run tests/memoryRetrievers.test.ts`

Limitations:
- BM25 is an in-repo baseline, not a production search service.

Next milestone:
- Add deterministic local embedding retrieval baseline.

## TASK-RAG-005 - Embedding Baseline

Status: Done

Done:
- Added `EmbeddingProvider` interface.
- Added deterministic local token-hashing embedding provider for tests and
  default local runs.
- Added embedding retriever with local lexical overlap support.
- No external API key is required and no external call is made.

Tests run:
- `npm run test --workspace releaseguard -- --run tests/memoryRetrievers.test.ts`

Limitations:
- Deterministic local embeddings are a CI-safe baseline, not a semantic model.
- Optional live provider wiring is intentionally not required for v0.2.

Next milestone:
- Add RRF hybrid retrieval.

## TASK-RAG-006 - RRF Hybrid Retrieval

Status: Done

Done:
- Added Reciprocal Rank Fusion over BM25 and embedding rankings.
- Uses `k=60`.
- Preserves component ranks for report/debug use.

Tests run:
- `npm run test --workspace releaseguard -- --run tests/memoryRetrievers.test.ts`

Limitations:
- Hybrid retrieval uses only BM25 and the deterministic embedding baseline in
  v0.2.

Next milestone:
- Add temporal decay.

## TASK-RAG-007 - Temporal Decay

Status: Done

Done:
- Added simple exponential temporal decay for dated incident/report chunks.
- ADR chunks are not penalized by age.
- Chunks without dates remain retrievable without penalty.

Tests run:
- `npm run test --workspace releaseguard -- --run tests/memoryRetrievers.test.ts`

Limitations:
- Date extraction is filename-based and intentionally simple.

Next milestone:
- Add repo memory trust tiers and self-immunity hooks.

## TASK-RAG-008 - RAG Trust Policy

Status: Done

Done:
- Added trust tiers:
  - `trusted_for_decision_context`
  - `context_only`
  - `retrieval_only`
- Added current-PR modified-file self-immunity hook.
- Added intended-use checks so context-only memory cannot be used as
  decision-changing context.

Tests run:
- `npm run test --workspace releaseguard -- --run tests/memoryTrustCitation.test.ts`

Limitations:
- v0.2 only reports trust context; it does not use RAG to change decisions.

Next milestone:
- Add memory citation validator.

## TASK-RAG-009 - Memory Citation Validator

Status: Done

Done:
- Added citation validation for repo memory chunks.
- Rejects unknown chunk IDs, chunks outside the current retrieval result set,
  index version mismatches, and chunks not trusted for the intended use.
- Allows context-only memory for report context.

Tests run:
- `npm run test --workspace releaseguard -- --run tests/memoryTrustCitation.test.ts`

Limitations:
- Retry behavior is not implemented in v0.2 because validation is
  deterministic and no live LLM calls are used.

Next milestone:
- Add deterministic RAG eval dataset generation.

## TASK-RAG-010 - RAG Eval Dataset

Status: Done

Done:
- Added deterministic eval dataset generation from indexed chunks.
- Includes direct, paraphrase, near-miss, and no-answer query types.
- Writes `.releaseguard/rag_eval_dataset.json`.

Tests run:
- `npm run test --workspace releaseguard -- --run tests/memoryEvalBenchmark.test.ts`

Limitations:
- Queries are deterministic templates and are not human-reviewed.

Next milestone:
- Add retriever benchmark report.

## TASK-RAG-011 - Retriever Benchmark

Status: Done

Done:
- Added `npm run releaseguard -- memory benchmark`.
- Benchmarks BM25, embedding, and RRF hybrid retrieval.
- Computes Recall@5, MRR, and no-answer false positive rate.
- Writes:
  - `.releaseguard/reports/rag_benchmark_v0_2.md`
  - `.releaseguard/reports/rag_benchmark_v0_2.json`

Tests run:
- `npm run test --workspace releaseguard -- --run tests/memoryEvalBenchmark.test.ts`

Limitations:
- The corpus and eval set are intentionally small; metrics are directional.

Next milestone:
- Add discount/checkout context demo report.

## TASK-RAG-012 - Discount Context Demo

Status: Done

Done:
- Added `npm run releaseguard -- memory demo-discount-context`.
- Generates `.releaseguard/reports/rag_demo_discount_context.md`.
- Demonstrates graph-only affected capabilities plus retrieved ADR/incident
  memory for discount and checkout historical risk.
- Explicitly states that v0.2 RAG does not change PASS/WARN/BLOCK.

Tests run:
- `npm run test --workspace releaseguard -- --run tests/memoryEvalBenchmark.test.ts`

Limitations:
- The demo is local markdown only and does not sync live GitHub issues or PRs.

Next milestone:
- Run full v0.1/v0.2 verification and record final benchmark output.

## v0.2 Final Verification

Status: Done

Done:
- Completed v0.2 Repo Memory RAG foundation end-to-end.
- `memory index` generates 46 typed chunks from local docs, ADRs, incidents, and
  supported report memory.
- `memory benchmark` compares BM25, embedding, and RRF hybrid baselines.
- Benchmark report includes deterministic citation validation checks for
  grounding behavior.
- `memory demo-discount-context` generates a discount/checkout historical
  context report.
- v0.1 self-check still passes and RAG remains disconnected from the
  deterministic Decision Engine.

Commands run:
- `npm run test --workspace releaseguard`
- `npm run build --workspace releaseguard`
- `npm run releaseguard -- memory index`
- `npm run releaseguard -- memory benchmark`
- `npm run releaseguard -- memory demo-discount-context`
- `npm test`
- `npm run build --workspace @releaseguard/demo-app`
- `npm run releaseguard:selfcheck`
- `npm run test --workspace @releaseguard/demo-app`

Benchmark output:
- Chunks: 46
- Eval items: 14
- BM25: Recall@5 `0.923`, MRR `0.346`
- Embedding: Recall@5 `0.692`, MRR `0.310`
- RRF hybrid: Recall@5 `0.923`, MRR `0.390`
- Citation validation eval:
  - valid retrieved citation accepted: yes
  - nonexistent chunk rejected: yes
  - outside retrieval set rejected: yes
  - untrusted decision context rejected: yes

Artifacts:
- `.releaseguard/memory_chunks.json`
- `.releaseguard/rag_eval_dataset.json`
- `.releaseguard/reports/rag_benchmark_v0_2.md`
- `.releaseguard/reports/rag_benchmark_v0_2.json`
- `.releaseguard/reports/rag_demo_discount_context.md`

Limitations:
- v0.2 does not use RAG to change merge decisions.
- v0.2 does not sync live GitHub issues or PRs.
- v0.2 does not use pgvector.
- v0.2 does not do reranking.
- v0.2 does not ingest arbitrary CI logs.
- v0.2 does not let current-PR docs lower test requirements.

Next milestone:
- v0.3 can use trusted RAG context to inform evidence priority, but only with
  deterministic safeguards and without giving RAG authority over merge
  decisions.
