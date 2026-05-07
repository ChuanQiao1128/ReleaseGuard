import { CapabilityGraph } from "../graph/types";
import { retrieveWithBm25 } from "./bm25Retriever";
import {
  CapabilityQueryExpansion,
  expandQueryWithCapabilities,
} from "./capabilityQueryExpansion";
import { retrieveWithEmbeddings } from "./embeddingRetriever";
import { MemoryRetrievalResult, MemoryRetrieverFilters } from "./retrieverTypes";
import { fuseWithRrf } from "./rrfRetriever";
import { tokenize } from "./tokenize";
import { RepoMemoryChunk } from "./types";

export type RetrievalDecision =
  | "HAS_RELEVANT_CONTEXT"
  | "LOW_CONFIDENCE_CONTEXT"
  | "NO_RELEVANT_CONTEXT";

export type GuardedRetrievalThresholds = {
  bm25MinTopScore: number;
  minQueryTokenOverlap: number;
  minQueryTokenOverlapRatio: number;
  embeddingMinTopScore: number;
  sharedTopRankLimit: number;
};

export const DEFAULT_GUARDED_RETRIEVAL_THRESHOLDS: GuardedRetrievalThresholds = {
  bm25MinTopScore: 0.2,
  minQueryTokenOverlap: 1,
  minQueryTokenOverlapRatio: 0.5,
  embeddingMinTopScore: 0.35,
  sharedTopRankLimit: 5,
};

export type GuardedRetrievalResult = {
  decision: RetrievalDecision;
  reason: string;
  results: MemoryRetrievalResult[];
  retriever: "guarded_rrf_hybrid" | "capability_guarded_rrf_hybrid";
  thresholds_used: GuardedRetrievalThresholds;
  query_expansion?: CapabilityQueryExpansion;
  signals: {
    bm25TopScore: number;
    embeddingTopScore: number;
    queryTokenOverlap: number;
    queryTokenOverlapRatio: number;
    sharedChunkInTopRanks: boolean;
    metadataSupported: boolean;
  };
};

export async function guardedRetrieveWithRrf(args: {
  chunks: RepoMemoryChunk[];
  query: string;
  limit?: number;
  filters?: MemoryRetrieverFilters;
  thresholds?: Partial<GuardedRetrievalThresholds>;
  capabilityIds?: string[];
  graph?: CapabilityGraph;
}): Promise<GuardedRetrievalResult> {
  const thresholds = {
    ...DEFAULT_GUARDED_RETRIEVAL_THRESHOLDS,
    ...args.thresholds,
  };
  const queryExpansion = expandQueryWithCapabilities({
    query: args.query,
    capabilityIds: args.capabilityIds,
    graph: args.graph,
  });
  const retriever: GuardedRetrievalResult["retriever"] =
    queryExpansion.matched_capability_ids.length > 0
      ? "capability_guarded_rrf_hybrid"
      : "guarded_rrf_hybrid";
  if (args.query.trim().length === 0 || args.chunks.length === 0) {
    return guardedResult({
      decision: "NO_RELEVANT_CONTEXT",
      reason: "empty query or corpus",
      results: [],
      thresholds,
      bm25Results: [],
      embeddingResults: [],
      query: args.query,
      chunks: args.chunks,
      capabilityIds: queryExpansion.matched_capability_ids,
      queryExpansion,
      retriever,
    });
  }

  if (queryExpansion.matched_capability_ids.length > 0) {
    const originalQueryResult = await guardedRetrieveCore({
      ...args,
      retrievalQuery: args.query,
      thresholds,
      queryExpansion,
      retriever,
    });
    if (originalQueryResult.decision !== "NO_RELEVANT_CONTEXT") {
      return originalQueryResult;
    }
  }

  return guardedRetrieveCore({
    ...args,
    retrievalQuery: queryExpansion.expanded_query,
    thresholds,
    queryExpansion,
    retriever,
  });
}

async function guardedRetrieveCore(args: {
  chunks: RepoMemoryChunk[];
  query: string;
  retrievalQuery: string;
  limit?: number;
  filters?: MemoryRetrieverFilters;
  thresholds: GuardedRetrievalThresholds;
  capabilityIds?: string[];
  graph?: CapabilityGraph;
  queryExpansion: CapabilityQueryExpansion;
  retriever: GuardedRetrievalResult["retriever"];
}): Promise<GuardedRetrievalResult> {
  const bm25Results = retrieveWithBm25({
    chunks: args.chunks,
    query: args.retrievalQuery,
    limit: 10,
    filters: args.filters,
  });
  const embeddingResults = await retrieveWithEmbeddings({
    chunks: args.chunks,
    query: args.retrievalQuery,
    limit: 10,
    filters: args.filters,
  });
  const rrfResults = fuseWithRrf({
    bm25Results,
    embeddingResults,
    limit: args.limit ?? 5,
  }).map((result) => ({
    ...result,
    retriever: args.retriever,
  }));

  const queryTokenOverlap = queryTokenOverlapSignal({
    chunks: args.chunks,
    results: bm25Results,
    query: args.retrievalQuery,
  });
  const bm25TopScore = bm25Results[0]?.score ?? 0;
  const embeddingTopScore = embeddingResults[0]?.score ?? 0;
  const sharedChunkInTopRanks = hasSharedTopChunk({
    bm25Results,
    embeddingResults,
    rankLimit: args.thresholds.sharedTopRankLimit,
  });
  const metadataSupported = hasMetadataSupport({
    chunks: args.chunks,
    results: rrfResults,
    capabilityIds: args.queryExpansion.matched_capability_ids,
  });
  const capabilityMetadataSupported =
    args.queryExpansion.matched_capability_ids.length > 0 && metadataSupported;
  const lexicalSignalPresent =
    bm25TopScore > args.thresholds.bm25MinTopScore &&
    queryTokenOverlap.overlap >= args.thresholds.minQueryTokenOverlap;

  if (
    !lexicalSignalPresent ||
    (
      queryTokenOverlap.ratio <= args.thresholds.minQueryTokenOverlapRatio &&
      !capabilityMetadataSupported
    )
  ) {
    return guardedResult({
      decision: "NO_RELEVANT_CONTEXT",
      reason: "no positive lexical retrieval signal",
      results: [],
      thresholds: args.thresholds,
      bm25Results,
      embeddingResults,
      query: args.retrievalQuery,
      chunks: args.chunks,
      capabilityIds: args.queryExpansion.matched_capability_ids,
      queryExpansion: args.queryExpansion,
      retriever: args.retriever,
    });
  }

  if (
    sharedChunkInTopRanks ||
    (embeddingTopScore >= args.thresholds.embeddingMinTopScore && metadataSupported)
  ) {
    return guardedResult({
      decision: "HAS_RELEVANT_CONTEXT",
      reason: sharedChunkInTopRanks
        ? "bm25 and embedding support overlapping chunks"
        : "positive lexical signal with metadata-supported embedding context",
      results: rrfResults,
      thresholds: args.thresholds,
      bm25Results,
      embeddingResults,
      query: args.retrievalQuery,
      chunks: args.chunks,
      capabilityIds: args.queryExpansion.matched_capability_ids,
      queryExpansion: args.queryExpansion,
      retriever: args.retriever,
    });
  }

  return guardedResult({
    decision: "LOW_CONFIDENCE_CONTEXT",
    reason: "only one weak retrieval signal is available",
    results: rrfResults.slice(0, 1),
    thresholds: args.thresholds,
    bm25Results,
    embeddingResults,
    query: args.retrievalQuery,
    chunks: args.chunks,
    capabilityIds: args.queryExpansion.matched_capability_ids,
    queryExpansion: args.queryExpansion,
    retriever: args.retriever,
  });
}

function guardedResult(args: {
  decision: RetrievalDecision;
  reason: string;
  results: MemoryRetrievalResult[];
  thresholds: GuardedRetrievalThresholds;
  bm25Results: MemoryRetrievalResult[];
  embeddingResults: MemoryRetrievalResult[];
  query: string;
  chunks: RepoMemoryChunk[];
  capabilityIds: string[];
  queryExpansion: CapabilityQueryExpansion;
  retriever: "guarded_rrf_hybrid" | "capability_guarded_rrf_hybrid";
}): GuardedRetrievalResult {
  const overlap = queryTokenOverlapSignal({
    chunks: args.chunks,
    results: args.bm25Results,
    query: args.query,
  });
  return {
    decision: args.decision,
    reason: args.reason,
    results: args.results,
    retriever: args.retriever,
    thresholds_used: args.thresholds,
    query_expansion: args.queryExpansion.matched_capability_ids.length > 0
      ? args.queryExpansion
      : undefined,
    signals: {
      bm25TopScore: args.bm25Results[0]?.score ?? 0,
      embeddingTopScore: args.embeddingResults[0]?.score ?? 0,
      queryTokenOverlap: overlap.overlap,
      queryTokenOverlapRatio: overlap.ratio,
      sharedChunkInTopRanks: hasSharedTopChunk({
        bm25Results: args.bm25Results,
        embeddingResults: args.embeddingResults,
        rankLimit: args.thresholds.sharedTopRankLimit,
      }),
      metadataSupported: hasMetadataSupport({
        chunks: args.chunks,
        results: args.results,
        capabilityIds: args.capabilityIds,
      }),
    },
  };
}

function hasSharedTopChunk(args: {
  bm25Results: MemoryRetrievalResult[];
  embeddingResults: MemoryRetrievalResult[];
  rankLimit: number;
}): boolean {
  const bm25ChunkIds = new Set(
    args.bm25Results
      .filter((result) => result.rank <= args.rankLimit)
      .map((result) => result.chunk_id),
  );
  return args.embeddingResults
    .filter((result) => result.rank <= args.rankLimit)
    .some((result) => bm25ChunkIds.has(result.chunk_id));
}

function hasMetadataSupport(args: {
  chunks: RepoMemoryChunk[];
  results: MemoryRetrievalResult[];
  capabilityIds: string[];
}): boolean {
  const requestedCapabilities = new Set(args.capabilityIds);
  return args.results.some((result) => {
    const chunk = args.chunks.find((item) => item.chunk_id === result.chunk_id);
    if (!chunk) {
      return false;
    }
    if (requestedCapabilities.size === 0) {
      return chunk.related_capability_ids.length > 0;
    }
    return chunk.related_capability_ids.some((capabilityId) =>
      requestedCapabilities.has(capabilityId),
    );
  });
}

function queryTokenOverlapSignal(args: {
  chunks: RepoMemoryChunk[];
  results: MemoryRetrievalResult[];
  query: string;
}): { overlap: number; ratio: number } {
  const queryTokens = new Set(tokenize(args.query).filter(isMeaningfulToken));
  if (queryTokens.size === 0 || args.results.length === 0) {
    return { overlap: 0, ratio: 0 };
  }
  const chunksById = new Map(args.chunks.map((chunk) => [chunk.chunk_id, chunk]));
  let maxOverlap = 0;
  for (const result of args.results) {
    const chunk = chunksById.get(result.chunk_id);
    if (!chunk) {
      continue;
    }
    const textTokens = new Set(
      tokenize([chunk.title, chunk.heading_path.join(" "), chunk.text].join(" "))
        .filter(isMeaningfulToken),
    );
    let overlap = 0;
    for (const token of queryTokens) {
      if (textTokens.has(token)) {
        overlap += 1;
      }
    }
    maxOverlap = Math.max(maxOverlap, overlap);
  }
  return {
    overlap: maxOverlap,
    ratio: maxOverlap / queryTokens.size,
  };
}

function isMeaningfulToken(token: string): boolean {
  return !STOPWORDS.has(token);
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "do",
  "does",
  "for",
  "handle",
  "how",
  "is",
  "of",
  "the",
  "to",
  "we",
  "what",
]);
