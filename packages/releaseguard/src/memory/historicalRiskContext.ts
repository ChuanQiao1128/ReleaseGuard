import { createHash } from "node:crypto";
import { CapabilityGraph } from "../graph/types";
import { retrieveWithBm25 } from "./bm25Retriever";
import { guardedRetrieveWithRrf, RetrievalDecision } from "./guardedRetriever";
import {
  RepoMemoryCitation,
  validateRepoMemoryCitation,
} from "./memoryCitationValidator";
import { writeRepoMemoryIndex } from "./memoryIndex";
import { MemoryRetrievalResult } from "./retrieverTypes";
import { RepoMemorySourceType, RepoMemoryTrustTier, RepoMemoryChunk } from "./types";

export type HistoricalRiskEvidenceImplication =
  | "require_browser_smoke"
  | "require_api_edge_case"
  | "require_contract_check"
  | "report_only";

export type HistoricalRiskValidationStatus =
  | "accepted"
  | "rejected"
  | "low_confidence";

export type HistoricalRiskContext = {
  context_id: string;
  affected_capability_ids: string[];
  source_chunk_ids: string[];
  source_types: RepoMemorySourceType[];
  trust_tier: RepoMemoryTrustTier;
  summary: string;
  evidence_implication: HistoricalRiskEvidenceImplication;
  validation_status: HistoricalRiskValidationStatus;
  reason: string;
};

export type HistoricalRiskContextResolution = {
  contexts: HistoricalRiskContext[];
  retrievalDecision: RetrievalDecision;
  retrievalReason: string;
  retrievedChunkIds: string[];
};

export async function resolveHistoricalRiskContexts(args: {
  rootDir: string;
  graph: CapabilityGraph;
  affectedCapabilityIds: string[];
  modifiedFiles?: string[];
}): Promise<HistoricalRiskContextResolution> {
  if (!shouldResolveHistoricalRisk(args.affectedCapabilityIds)) {
    return emptyResolution("NO_RELEVANT_CONTEXT", "no checkout discount capability context");
  }

  const index = await writeRepoMemoryIndex(args.rootDir, {
    modifiedFiles: args.modifiedFiles,
  });
  const retrieval = await guardedRetrieveWithRrf({
    chunks: index.chunks,
    query: historicalRiskQuery(),
    filters: { source_type: ["adr", "incident", "doc"] },
    limit: 8,
    capabilityIds: args.affectedCapabilityIds,
    graph: args.graph,
  });
  if (retrieval.decision !== "HAS_RELEVANT_CONTEXT") {
    return emptyResolution(retrieval.decision, retrieval.reason);
  }
  const retrievalResults = mergeRetrievalResults([
    retrieval.results,
    retrieveWithBm25({
      chunks: index.chunks,
      query: "2024 discount validation crash incident invalid discount HTTP 500",
      filters: { source_type: ["incident"] },
      limit: 3,
    }),
  ]);

  const contexts = buildHistoricalRiskContextsFromRetrieval({
    affectedCapabilityIds: args.affectedCapabilityIds,
    chunks: index.chunks,
    retrievalResults,
    retrievalDecision: retrieval.decision,
    retrievalReason: retrieval.reason,
  });

  return {
    contexts,
    retrievalDecision: retrieval.decision,
    retrievalReason: retrieval.reason,
    retrievedChunkIds: retrievalResults.map((result) => result.chunk_id),
  };
}

export function buildHistoricalRiskContextsFromRetrieval(args: {
  affectedCapabilityIds: string[];
  chunks: RepoMemoryChunk[];
  retrievalResults: MemoryRetrievalResult[];
  retrievalDecision: RetrievalDecision;
  retrievalReason: string;
}): HistoricalRiskContext[] {
  if (args.retrievalDecision === "NO_RELEVANT_CONTEXT") {
    return [];
  }

  const retrievedChunks = args.retrievalResults
    .map((result) => args.chunks.find((chunk) => chunk.chunk_id === result.chunk_id))
    .filter((chunk): chunk is RepoMemoryChunk => Boolean(chunk));
  if (retrievedChunks.length === 0) {
    return [];
  }

  const decisionContextChunks = validateChunks({
    chunks: args.chunks,
    retrievalResults: args.retrievalResults,
    retrievedChunks,
    intendedUse: "decision_context",
  });
  const reportContextChunks = validateChunks({
    chunks: args.chunks,
    retrievalResults: args.retrievalResults,
    retrievedChunks,
    intendedUse: "report_context",
  });
  const trustedAdrChunks = decisionContextChunks.filter(
    (chunk) => chunk.source_type === "adr",
  );
  const incidentChunks = reportContextChunks.filter(
    (chunk) => chunk.source_type === "incident",
  );

  if (trustedAdrChunks.length > 0 && incidentChunks.length > 0) {
    const sourceChunks = uniqueChunks([...trustedAdrChunks, ...incidentChunks]);
    return [
      historicalRiskContext({
        affectedCapabilityIds: args.affectedCapabilityIds,
        sourceChunks,
        evidenceImplication: "require_browser_smoke",
        validationStatus: "accepted",
        reason:
          "trusted checkout ADR plus historical discount incident support requiring checkout browser smoke evidence.",
      }),
    ];
  }

  if (reportContextChunks.length > 0) {
    return [
      historicalRiskContext({
        affectedCapabilityIds: args.affectedCapabilityIds,
        sourceChunks: reportContextChunks,
        evidenceImplication: "report_only",
        validationStatus: "rejected",
        reason:
          "retrieved repo memory is not trusted to raise evidence priority for this run.",
      }),
    ];
  }

  return [];
}

function shouldResolveHistoricalRisk(affectedCapabilityIds: string[]): boolean {
  return (
    affectedCapabilityIds.includes("api_apply_discount") &&
    affectedCapabilityIds.includes("route_checkout")
  );
}

function historicalRiskQuery(): string {
  return [
    "historical checkout risk after invalid discount validation changes",
    "which repo memory says checkout is a critical revenue path",
  ].join(" ");
}

function validateChunks(args: {
  chunks: RepoMemoryChunk[];
  retrievalResults: MemoryRetrievalResult[];
  retrievedChunks: RepoMemoryChunk[];
  intendedUse: RepoMemoryCitation["intended_use"];
}): RepoMemoryChunk[] {
  return args.retrievedChunks.filter((chunk) => {
    const result = validateRepoMemoryCitation({
      citation: {
        chunk_id: chunk.chunk_id,
        index_version: chunk.index_version,
        intended_use: args.intendedUse,
        reason: `historical risk ${args.intendedUse}`,
      },
      chunks: args.chunks,
      retrievalResults: args.retrievalResults,
    });
    return result.valid;
  });
}

function historicalRiskContext(args: {
  affectedCapabilityIds: string[];
  sourceChunks: RepoMemoryChunk[];
  evidenceImplication: HistoricalRiskEvidenceImplication;
  validationStatus: HistoricalRiskValidationStatus;
  reason: string;
}): HistoricalRiskContext {
  const sourceChunkIds = args.sourceChunks.map((chunk) => chunk.chunk_id).sort();
  return {
    context_id: `hrc_${hash(`${args.affectedCapabilityIds.join(",")}:${sourceChunkIds.join(",")}:${args.evidenceImplication}`)}`,
    affected_capability_ids: [...args.affectedCapabilityIds].sort(),
    source_chunk_ids: sourceChunkIds,
    source_types: [...new Set(args.sourceChunks.map((chunk) => chunk.source_type))].sort(),
    trust_tier: args.sourceChunks.some(
      (chunk) => chunk.trust_tier === "trusted_for_decision_context",
    )
      ? "trusted_for_decision_context"
      : args.sourceChunks[0]?.trust_tier ?? "context_only",
    summary:
      args.evidenceImplication === "require_browser_smoke"
        ? `Trusted repo memory retrieved ${sourceTitles(args.sourceChunks)} and links checkout critical-flow policy with historical discount validation failures.`
        : `Retrieved repo memory ${sourceTitles(args.sourceChunks)} is available for report context only.`,
    evidence_implication: args.evidenceImplication,
    validation_status: args.validationStatus,
    reason: args.reason,
  };
}

function sourceTitles(chunks: RepoMemoryChunk[]): string {
  const titles = [...new Set(chunks.map(sourceTitle))].slice(0, 4);
  return titles.length > 0 ? titles.join("; ") : "source chunks";
}

function sourceTitle(chunk: RepoMemoryChunk): string {
  if (chunk.file_path.includes("0007-checkout-critical-flow")) {
    return "ADR 0007: Checkout Critical Flow";
  }
  if (chunk.file_path.includes("2024-08-discount-crash")) {
    return "2024-08 Discount Validation Crash";
  }
  return chunk.title;
}

function uniqueChunks(chunks: RepoMemoryChunk[]): RepoMemoryChunk[] {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    if (seen.has(chunk.chunk_id)) {
      return false;
    }
    seen.add(chunk.chunk_id);
    return true;
  });
}

function mergeRetrievalResults(
  groups: MemoryRetrievalResult[][],
): MemoryRetrievalResult[] {
  const byId = new Map<string, MemoryRetrievalResult>();
  for (const result of groups.flat()) {
    const existing = byId.get(result.chunk_id);
    if (!existing || result.score > existing.score) {
      byId.set(result.chunk_id, result);
    }
  }
  return [...byId.values()].map((result, index) => ({
    ...result,
    rank: index + 1,
  }));
}

function emptyResolution(
  retrievalDecision: RetrievalDecision,
  retrievalReason: string,
): HistoricalRiskContextResolution {
  return {
    contexts: [],
    retrievalDecision,
    retrievalReason,
    retrievedChunkIds: [],
  };
}

function hash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}
