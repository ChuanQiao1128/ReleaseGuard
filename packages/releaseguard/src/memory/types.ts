export type RepoMemorySourceType =
  | "doc"
  | "adr"
  | "incident"
  | "releaseguard_report";

export type RepoMemoryTaggingStatus = "untagged" | "unresolved" | "tagged";

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
  created_at?: string;
  index_version: string;
};

export const REPO_MEMORY_INDEX_VERSION = "repo-memory-v0.2-task-rag-001";
