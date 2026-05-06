export type RepoMemorySourceType =
  | "doc"
  | "adr"
  | "incident"
  | "releaseguard_report";

export type RepoMemoryTaggingStatus = "untagged" | "unresolved" | "tagged";
export type RepoMemoryTaggingConfidence =
  | "high"
  | "medium"
  | "low"
  | "unresolved";
export type RepoMemoryTrustTier =
  | "trusted_for_decision_context"
  | "context_only"
  | "retrieval_only";

export type RepoMemoryEmbeddingMetadata = {
  embedding_model: string;
  embedding_provider: string;
  index_version: string;
};

export type RepoMemoryChunk = {
  chunk_id: string;
  source_type: RepoMemorySourceType;
  title: string;
  text: string;
  file_path: string;
  heading_path: string[];
  related_capability_ids: string[];
  related_file_paths: string[];
  tagging_status: RepoMemoryTaggingStatus;
  tagging_confidence: RepoMemoryTaggingConfidence;
  tagging_basis: string;
  trust_tier: RepoMemoryTrustTier;
  trusted_for_current_run: boolean;
  untrusted_reason?: string;
  embedding?: RepoMemoryEmbeddingMetadata;
  created_at?: string;
  index_version: string;
};

export const REPO_MEMORY_INDEX_VERSION = "repo-memory-v0.2";
