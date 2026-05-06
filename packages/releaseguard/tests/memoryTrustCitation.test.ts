import { describe, expect, it } from "vitest";
import {
  validateRepoMemoryCitation,
  RepoMemoryCitation,
} from "../src/memory/memoryCitationValidator";
import {
  applyRepoMemoryTrustPolicy,
  canUseRepoMemoryFor,
} from "../src/memory/trustPolicy";
import { MemoryRetrievalResult } from "../src/memory/retrieverTypes";
import { RepoMemoryChunk } from "../src/memory/types";

describe("Repo Memory trust policy and citations", () => {
  it("marks current-PR modified ADRs untrusted for current run", () => {
    const [chunk] = applyRepoMemoryTrustPolicy([fakeChunk("adr", "adr")], {
      modifiedFiles: ["docs/adr/adr.md"],
    });

    expect(chunk.trusted_for_current_run).toBe(false);
    expect(chunk.untrusted_reason).toBe("source_modified_in_current_pr");
    expect(canUseRepoMemoryFor(chunk, "decision_context")).toBe(false);
  });

  it("does not allow context-only memory as decision-changing context", () => {
    const chunk = fakeChunk("doc", "doc");

    expect(chunk.trust_tier).toBe("context_only");
    expect(canUseRepoMemoryFor(chunk, "decision_context")).toBe(false);
    expect(canUseRepoMemoryFor(chunk, "report_context")).toBe(true);
  });

  it("includes trust tier on retrieval-style results", () => {
    const result: MemoryRetrievalResult = {
      chunk_id: "doc",
      score: 1,
      rank: 1,
      retriever: "bm25",
      trust_tier: "context_only",
      trusted_for_current_run: true,
    };

    expect(result.trust_tier).toBe("context_only");
  });

  it("rejects nonexistent chunk citations", () => {
    const citation = citationFor("missing");

    const result = validateRepoMemoryCitation({
      citation,
      chunks: [fakeChunk("known", "adr")],
      retrievalResults: [retrieved("known")],
    });

    expect(result).toMatchObject({
      valid: false,
      reason: "unknown_chunk_id",
    });
  });

  it("rejects citations outside the current retrieval set", () => {
    const result = validateRepoMemoryCitation({
      citation: citationFor("adr"),
      chunks: [fakeChunk("adr", "adr")],
      retrievalResults: [],
    });

    expect(result).toMatchObject({
      valid: false,
      reason: "chunk_not_in_current_retrieval_set",
    });
  });

  it("rejects current-PR modified ADRs for decision context", () => {
    const [chunk] = applyRepoMemoryTrustPolicy([fakeChunk("adr", "adr")], {
      modifiedFiles: ["docs/adr/adr.md"],
    });

    const result = validateRepoMemoryCitation({
      citation: citationFor("adr"),
      chunks: [chunk],
      retrievalResults: [retrieved("adr")],
    });

    expect(result).toMatchObject({
      valid: false,
      reason: "chunk_not_trusted_for_decision_context",
    });
  });

  it("accepts context-only chunks for report context", () => {
    const chunk = fakeChunk("doc", "doc");

    const result = validateRepoMemoryCitation({
      citation: {
        ...citationFor("doc"),
        intended_use: "report_context",
      },
      chunks: [chunk],
      retrievalResults: [retrieved("doc")],
    });

    expect(result).toMatchObject({ valid: true });
  });

  it("accepts valid retrieved trusted chunks", () => {
    const chunk = fakeChunk("adr", "adr");

    const result = validateRepoMemoryCitation({
      citation: citationFor("adr"),
      chunks: [chunk],
      retrievalResults: [retrieved("adr")],
    });

    expect(result).toMatchObject({ valid: true });
  });
});

function citationFor(chunkId: string): RepoMemoryCitation {
  return {
    chunk_id: chunkId,
    index_version: "repo-memory-v0.2",
    intended_use: "decision_context",
    reason: "test citation",
  };
}

function retrieved(chunkId: string): MemoryRetrievalResult {
  return {
    chunk_id: chunkId,
    score: 1,
    rank: 1,
    retriever: "bm25",
  };
}

function fakeChunk(
  id: string,
  sourceType: RepoMemoryChunk["source_type"],
): RepoMemoryChunk {
  return {
    chunk_id: id,
    source_type: sourceType,
    title: id,
    text: id,
    file_path: `docs/${sourceType}/${id}.md`,
    heading_path: [id],
    related_capability_ids: [],
    related_file_paths: [],
    tagging_status: "unresolved",
    tagging_confidence: "unresolved",
    tagging_basis: "test",
    trust_tier:
      sourceType === "adr" ? "trusted_for_decision_context" : "context_only",
    trusted_for_current_run: true,
    index_version: "repo-memory-v0.2",
  };
}
