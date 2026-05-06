import { MemoryRetrievalResult } from "./retrieverTypes";

export const RRF_K = 60;

export function fuseWithRrf(args: {
  bm25Results: MemoryRetrievalResult[];
  embeddingResults: MemoryRetrievalResult[];
  limit?: number;
  k?: number;
}): MemoryRetrievalResult[] {
  const k = args.k ?? RRF_K;
  const scores = new Map<
    string,
    {
      score: number;
      bm25_rank?: number;
      embedding_rank?: number;
      trust_tier?: MemoryRetrievalResult["trust_tier"];
      trusted_for_current_run?: boolean;
    }
  >();

  addComponent(scores, args.bm25Results, "bm25_rank", k);
  addComponent(scores, args.embeddingResults, "embedding_rank", k);

  return [...scores.entries()]
    .map(([chunkId, value]) => ({
      chunk_id: chunkId,
      score: value.score,
      component_ranks: {
        bm25_rank: value.bm25_rank,
        embedding_rank: value.embedding_rank,
      },
      trust_tier: value.trust_tier,
      trusted_for_current_run: value.trusted_for_current_run,
    }))
    .sort((a, b) => b.score - a.score || a.chunk_id.localeCompare(b.chunk_id))
    .slice(0, args.limit ?? 5)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      retriever: "rrf_hybrid" as const,
    }));
}

function addComponent(
  scores: Map<
    string,
    {
      score: number;
      bm25_rank?: number;
      embedding_rank?: number;
      trust_tier?: MemoryRetrievalResult["trust_tier"];
      trusted_for_current_run?: boolean;
    }
  >,
  results: MemoryRetrievalResult[],
  rankField: "bm25_rank" | "embedding_rank",
  k: number,
) {
  for (const result of results) {
    const value = scores.get(result.chunk_id) ?? { score: 0 };
    value.score += 1 / (k + result.rank);
    value[rankField] = result.rank;
    value.trust_tier ??= result.trust_tier;
    value.trusted_for_current_run ??= result.trusted_for_current_run;
    scores.set(result.chunk_id, value);
  }
}
