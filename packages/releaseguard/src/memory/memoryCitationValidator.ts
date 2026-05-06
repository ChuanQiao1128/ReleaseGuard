import { MemoryRetrievalResult } from "./retrieverTypes";
import { canUseRepoMemoryFor, RepoMemoryIntendedUse } from "./trustPolicy";
import { RepoMemoryChunk } from "./types";

export type RepoMemoryCitation = {
  chunk_id: string;
  index_version: string;
  intended_use: RepoMemoryIntendedUse;
  reason: string;
};

export type RepoMemoryCitationValidationResult =
  | {
      valid: true;
      citation: RepoMemoryCitation;
      chunk: RepoMemoryChunk;
    }
  | {
      valid: false;
      reason: string;
    };

export function validateRepoMemoryCitation(args: {
  citation: RepoMemoryCitation;
  chunks: RepoMemoryChunk[];
  retrievalResults: MemoryRetrievalResult[];
}): RepoMemoryCitationValidationResult {
  const chunk = args.chunks.find(
    (item) => item.chunk_id === args.citation.chunk_id,
  );
  if (!chunk) {
    return { valid: false, reason: "unknown_chunk_id" };
  }

  const retrieved = args.retrievalResults.some(
    (result) => result.chunk_id === args.citation.chunk_id,
  );
  if (!retrieved) {
    return { valid: false, reason: "chunk_not_in_current_retrieval_set" };
  }

  if (chunk.index_version !== args.citation.index_version) {
    return { valid: false, reason: "index_version_mismatch" };
  }

  if (!canUseRepoMemoryFor(chunk, args.citation.intended_use)) {
    return {
      valid: false,
      reason:
        args.citation.intended_use === "decision_context"
          ? "chunk_not_trusted_for_decision_context"
          : "chunk_not_allowed_for_report_context",
    };
  }

  return {
    valid: true,
    citation: args.citation,
    chunk,
  };
}
