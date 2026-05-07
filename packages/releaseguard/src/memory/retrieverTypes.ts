import { RepoMemoryTrustTier } from "./types";

export type RetrieverName =
  | "bm25"
  | "embedding"
  | "rrf_hybrid"
  | "guarded_rrf_hybrid"
  | "capability_guarded_rrf_hybrid";

export type MemoryRetrievalResult = {
  chunk_id: string;
  score: number;
  rank: number;
  retriever: RetrieverName;
  trust_tier?: RepoMemoryTrustTier;
  trusted_for_current_run?: boolean;
  component_ranks?: {
    bm25_rank?: number;
    embedding_rank?: number;
  };
};

export type MemoryRetrieverFilters = {
  source_type?: string[];
  related_capability_ids?: string[];
  tagging_status?: string[];
};
