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

## v0.2.1 RAG Hardening and Presentation Polish

Status: Done

Done:
- Added dataset summary and query-type counts to
  `.releaseguard/reports/rag_benchmark_v0_2.md`.
- Added a clearer retriever comparison table with Recall@5, MRR, no-answer false
  positive rate, answerable query count, and no-answer query count.
- Added benchmark interpretation for BM25, deterministic local embeddings, and
  RRF hybrid ranking.
- Added explicit limitation text that this is a small demo-corpus benchmark, not
  a production retrieval benchmark.
- Updated README with current benchmark summary, deterministic local embedding
  fallback, and the discount/checkout RAG demo storyline.

Tests run:
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
- Queries: 14
- Query type counts:
  - direct: 10
  - paraphrase: 2
  - near_miss: 1
  - no_answer: 1
- BM25: Recall@5 `0.923`, MRR `0.346`, no-answer false positive rate `0.000`
- Embedding: Recall@5 `0.692`, MRR `0.310`, no-answer false positive rate `1.000`
- RRF hybrid: Recall@5 `0.923`, MRR `0.390`, no-answer false positive rate `1.000`

Demo output:
- `npm run releaseguard -- memory demo-discount-context`
- Retrieved chunks: 7
- Report: `.releaseguard/reports/rag_demo_discount_context.md`

Limitations:
- v0.2.1 does not add v0.3 RAG-informed evidence planning.
- RAG remains report-only and does not affect Evidence Planner or
  PASS/WARN/BLOCK decisions.

Next:
- v0.3 may use trusted RAG context to raise evidence priority, but v0.2.1 stops
  before any RAG-informed evidence planning or merge decision changes.

## v0.2.2 RAG Abstention and No-Answer Guard

Status: Done

Done:
- Added guarded RRF retrieval with explicit decisions:
  - `HAS_RELEVANT_CONTEXT`
  - `LOW_CONFIDENCE_CONTEXT`
  - `NO_RELEVANT_CONTEXT`
- Raw BM25, embedding, and RRF APIs remain available for baseline comparison.
- Expanded deterministic no-answer eval queries from 1 to 5.
- Added no-answer abstention rate and false abstention rate to benchmark
  metrics.
- Added `guarded_rrf_hybrid` to the benchmark.
- Added `npm run releaseguard -- memory search --query "<query>"`.
- README now documents retrieval abstention and shows no-answer/search examples.

Tests run:
- `npm run test --workspace releaseguard -- --run tests/memoryRetrievers.test.ts tests/memoryEvalBenchmark.test.ts`
- `npm run test --workspace releaseguard`
- `npm run build --workspace releaseguard`
- `npm run releaseguard -- memory index`
- `npm run releaseguard -- memory benchmark`
- `npm run releaseguard -- memory demo-discount-context`
- `npm run releaseguard -- memory search --query "How do we handle WebSocket reconnection?"`
- `npm run releaseguard -- memory search --query "discount checkout crash"`
- `npm test`
- `npm run build --workspace @releaseguard/demo-app`
- `npm run releaseguard:selfcheck`
- `npm run test --workspace @releaseguard/demo-app`

Benchmark output:
- Chunks: 46
- Queries: 18
- No-answer queries: 5
- BM25: Recall@5 `0.923`, MRR `0.346`, no-answer FPR `0.800`, no-answer abstention `0.200`
- Embedding: Recall@5 `0.692`, MRR `0.310`, no-answer FPR `1.000`, no-answer abstention `0.000`
- RRF hybrid: Recall@5 `0.923`, MRR `0.390`, no-answer FPR `1.000`, no-answer abstention `0.000`
- Guarded RRF hybrid: Recall@5 `0.846`, MRR `0.364`, no-answer FPR `0.000`, no-answer abstention `1.000`

No-answer guard behavior:
- `How do we handle WebSocket reconnection?` -> `NO_RELEVANT_CONTEXT`
- `discount checkout crash` -> `HAS_RELEVANT_CONTEXT`

Limitations:
- Guarded retrieval is conservative and trades some Recall@5 for no-answer
  safety.
- v0.2.2 remains report-only and does not affect Evidence Planner or
  PASS/WARN/BLOCK decisions.

Next:
- v0.3 may use trusted RAG context to raise evidence priority, but v0.2.2 stops
  before any RAG-informed evidence planning or merge decision changes.

## v0.2.3 RAG Abstention Calibration and Reporting

Status: Done

Done:
- Added false abstention count/rate to guarded retrieval benchmark metrics.
- Added guarded retriever abstention examples to the benchmark report:
  - no-answer queries correctly abstained,
  - answerable queries incorrectly abstained.
- Added guarded retrieval thresholds to the benchmark report.
- README now explains the abstention tradeoff and why it matters before v0.3.
- Kept existing thresholds unchanged; no-answer FPR remains `0.000` for guarded
  RRF hybrid.

Tests run:
- `npm run test --workspace releaseguard -- --run tests/memoryRetrievers.test.ts tests/memoryEvalBenchmark.test.ts`
- `npm run build --workspace releaseguard`
- `npm run releaseguard -- memory benchmark`
- `npm run test --workspace releaseguard`
- `npm run releaseguard -- memory index`
- `npm run releaseguard -- memory demo-discount-context`
- `npm test`
- `npm run build --workspace @releaseguard/demo-app`
- `npm run releaseguard:selfcheck`
- `npm run test --workspace @releaseguard/demo-app`

Benchmark output so far:
- Chunks: 46
- Queries: 18
- No-answer queries: 5
- Guarded RRF hybrid:
  - Recall@5 `0.846`
  - MRR `0.364`
  - no-answer FPR `0.000`
  - no-answer abstention `1.000`
  - false abstention count `2`
  - false abstention rate `0.154`

Abstention examples:
- Correct no-answer abstentions:
  - `How do we handle WebSocket reconnection?`
  - `What is the Redis cache eviction policy?`
  - `How are payment provider secrets rotated?`
  - `What is the mobile push notification retry policy?`
  - `What is the feature flag rollout strategy?`
- False abstentions:
  - `historical checkout risk after invalid discount validation changes`
  - `which repo memory says checkout is a critical revenue path`

Limitations:
- v0.2.3 reports abstention tradeoffs but does not tune thresholds.
- v0.2.3 remains report-only and does not affect Evidence Planner or
  PASS/WARN/BLOCK decisions.

Next:
- v0.3 may use trusted RAG context to raise evidence priority, but v0.2.3 stops
  before any RAG-informed evidence planning or merge decision changes.

## v0.2.4 Capability-aware Retrieval Calibration

Status: Done

Done:
- Added deterministic capability-aware query expansion for repo-memory
  retrieval.
- Expansion only uses known capability IDs and local aliases; no LLM calls are
  made.
- Guarded retrieval now uses expansion as a fallback path only when the
  original guarded query would abstain.
- Added `capability_guarded_rrf_hybrid` to the benchmark.
- Updated the discount context demo report with:
  - original query,
  - expanded query terms,
  - matched capability IDs,
  - guarded retrieval decision and reason.
- RAG remains report-only and does not affect Evidence Planner or
  PASS/WARN/BLOCK decisions.

Tests run:
- `npm run test --workspace releaseguard -- memoryRetrievers.test.ts memoryEvalBenchmark.test.ts`
- `npm run test --workspace releaseguard`
- `npm run build --workspace releaseguard`
- `npm run releaseguard -- memory index`
- `npm run releaseguard -- memory benchmark`
- `npm run releaseguard -- memory demo-discount-context`
- `npm test`
- `npm run build --workspace @releaseguard/demo-app`
- `npm run releaseguard:selfcheck`
- `npm run test --workspace @releaseguard/demo-app`

Benchmark output so far:
- Chunks: 46
- Queries: 18
- No-answer queries: 5
- Guarded RRF hybrid:
  - Recall@5 `0.846`
  - MRR `0.364`
  - no-answer FPR `0.000`
  - no-answer abstention `1.000`
  - false abstention count `2`
  - false abstention rate `0.154`
- Capability-aware guarded RRF hybrid:
  - Recall@5 `0.923`
  - MRR `0.390`
  - no-answer FPR `0.000`
  - no-answer abstention `1.000`
  - false abstention count `0`
  - false abstention rate `0.000`

Before / after:
- False abstention count: `2` -> `0`
- No-answer FPR: `0.000` -> `0.000`

Limitations:
- Capability-aware retrieval uses graph-provided capability IDs as task
  context. It does not discover structured dependencies.
- The benchmark is still a small deterministic demo-corpus benchmark.
- v0.2.4 does not add RAG-informed evidence priority.

Next:
- v0.3 may use trusted RAG context to raise evidence priority, but RAG must
  still never lower requirements or decide PASS/WARN/BLOCK.
