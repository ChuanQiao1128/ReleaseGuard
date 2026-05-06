import { RepoMemoryChunk } from "./types";
import { MemoryRetrievalResult, MemoryRetrieverFilters } from "./retrieverTypes";
import { applyTemporalDecay } from "./temporalDecay";
import { tokenize } from "./tokenize";

const K1 = 1.2;
const B = 0.75;

export function retrieveWithBm25(args: {
  chunks: RepoMemoryChunk[];
  query: string;
  limit?: number;
  filters?: MemoryRetrieverFilters;
  applyDecay?: boolean;
}): MemoryRetrievalResult[] {
  const queryTokens = tokenize(args.query);
  if (queryTokens.length === 0 || args.chunks.length === 0) {
    return [];
  }

  const candidates = filterChunks(args.chunks, args.filters);
  if (candidates.length === 0) {
    return [];
  }

  const docs = candidates.map((chunk) => ({
    chunk,
    tokens: tokenize([chunk.title, chunk.heading_path.join(" "), chunk.text].join(" ")),
  }));
  const avgDocLength =
    docs.reduce((sum, doc) => sum + doc.tokens.length, 0) / Math.max(docs.length, 1);
  const documentFrequency = new Map<string, number>();
  for (const token of new Set(queryTokens)) {
    documentFrequency.set(
      token,
      docs.filter((doc) => doc.tokens.includes(token)).length,
    );
  }

  return docs
    .map((doc) => {
      const termFrequency = new Map<string, number>();
      for (const token of doc.tokens) {
        termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
      }

      let score = 0;
      for (const token of queryTokens) {
        const tf = termFrequency.get(token) ?? 0;
        if (tf === 0) {
          continue;
        }
        const df = documentFrequency.get(token) ?? 0;
        const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
        const denominator =
          tf + K1 * (1 - B + B * (doc.tokens.length / Math.max(avgDocLength, 1)));
        score += idf * ((tf * (K1 + 1)) / denominator);
      }

      return {
        chunk_id: doc.chunk.chunk_id,
        score: args.applyDecay === false ? score : applyTemporalDecay(score, doc.chunk),
        trust_tier: doc.chunk.trust_tier,
        trusted_for_current_run: doc.chunk.trusted_for_current_run,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk_id.localeCompare(b.chunk_id))
    .slice(0, args.limit ?? 5)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      retriever: "bm25",
    }));
}

export function filterChunks(
  chunks: RepoMemoryChunk[],
  filters: MemoryRetrieverFilters | undefined,
): RepoMemoryChunk[] {
  if (!filters) {
    return chunks;
  }
  return chunks.filter((chunk) => {
    if (filters.source_type && !filters.source_type.includes(chunk.source_type)) {
      return false;
    }
    if (
      filters.tagging_status &&
      !filters.tagging_status.includes(chunk.tagging_status)
    ) {
      return false;
    }
    if (filters.related_capability_ids) {
      const hasCapability = filters.related_capability_ids.some((id) =>
        chunk.related_capability_ids.includes(id),
      );
      if (!hasCapability) {
        return false;
      }
    }
    return true;
  });
}
