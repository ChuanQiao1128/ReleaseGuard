import {
  RepoMemoryChunk,
  RepoMemorySourceType,
  RepoMemoryTrustTier,
} from "./types";

export type RepoMemoryIntendedUse = "decision_context" | "report_context";

export function trustTierForSourceType(
  sourceType: RepoMemorySourceType,
): RepoMemoryTrustTier {
  if (sourceType === "adr") {
    return "trusted_for_decision_context";
  }
  if (sourceType === "doc") {
    return "context_only";
  }
  return "retrieval_only";
}

export function applyRepoMemoryTrustPolicy(
  chunks: RepoMemoryChunk[],
  options: {
    modifiedFiles?: string[];
  } = {},
): RepoMemoryChunk[] {
  const modifiedFiles = new Set(
    (options.modifiedFiles ?? []).map((filePath) => normalizePath(filePath)),
  );

  return chunks.map((chunk) => {
    const sourceModified = modifiedFiles.has(normalizePath(chunk.file_path));
    return {
      ...chunk,
      trust_tier: chunk.trust_tier ?? trustTierForSourceType(chunk.source_type),
      trusted_for_current_run: sourceModified
        ? false
        : chunk.trusted_for_current_run,
      untrusted_reason: sourceModified
        ? "source_modified_in_current_pr"
        : chunk.untrusted_reason,
    };
  });
}

export function canUseRepoMemoryFor(
  chunk: RepoMemoryChunk,
  intendedUse: RepoMemoryIntendedUse,
): boolean {
  if (intendedUse === "report_context") {
    return true;
  }
  return (
    chunk.trust_tier === "trusted_for_decision_context" &&
    chunk.trusted_for_current_run
  );
}

function normalizePath(filePath: string): string {
  return filePath.split("\\").join("/");
}
