import { defaultEmbeddingProvider, EmbeddingProvider, cosineSimilarity } from "./embeddingProvider";
import { filterChunks } from "./bm25Retriever";
import { MemoryRetrievalResult, MemoryRetrieverFilters } from "./retrieverTypes";
import { applyTemporalDecay } from "./temporalDecay";
import { tokenize } from "./tokenize";
import { RepoMemoryChunk } from "./types";

export async function retrieveWithEmbeddings(args: {
  chunks: RepoMemoryChunk[];
  query: string;
  limit?: number;
  filters?: MemoryRetrieverFilters;
  provider?: EmbeddingProvider;
  applyDecay?: boolean;
}): Promise<MemoryRetrievalResult[]> {
  if (args.query.trim().length === 0 || args.chunks.length === 0) {
    return [];
  }

  const provider = args.provider ?? defaultEmbeddingProvider();
  const queryEmbedding = await provider.embed(args.query);
  const queryTokens = new Set(tokenize(args.query));
  const candidates = filterChunks(args.chunks, args.filters);

  const scored = await Promise.all(
    candidates.map(async (chunk) => {
      const chunkText = [chunk.title, chunk.heading_path.join(" "), chunk.text].join(
        " ",
      );
      const chunkEmbedding = await provider.embed(chunkText);
      const rawScore =
        cosineSimilarity(queryEmbedding, chunkEmbedding) +
        lexicalOverlapBoost(queryTokens, chunkText);
      return {
        chunk_id: chunk.chunk_id,
        score: args.applyDecay === false
          ? rawScore
          : applyTemporalDecay(rawScore, chunk),
        trust_tier: chunk.trust_tier,
        trusted_for_current_run: chunk.trusted_for_current_run,
      };
    }),
  );

  return scored
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk_id.localeCompare(b.chunk_id))
    .slice(0, args.limit ?? 5)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      retriever: "embedding",
    }));
}

function lexicalOverlapBoost(queryTokens: Set<string>, text: string): number {
  if (queryTokens.size === 0) {
    return 0;
  }
  const textTokens = new Set(tokenize(text));
  let overlap = 0;
  for (const token of queryTokens) {
    if (textTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / queryTokens.size;
}
