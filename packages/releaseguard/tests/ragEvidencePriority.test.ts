import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decide } from "../src/decision/decisionEngine";
import { planEvidence } from "../src/evidence/evidencePlanner";
import { EvidenceExecutionResult } from "../src/executor/selectedTestExecutor";
import {
  buildHistoricalRiskContextsFromRetrieval,
  HistoricalRiskContext,
} from "../src/memory/historicalRiskContext";
import { MemoryRetrievalResult } from "../src/memory/retrieverTypes";
import { RepoMemoryChunk, RepoMemorySourceType } from "../src/memory/types";
import { runReleaseGuard } from "../src/run";
import { scanRepository } from "../src/scanner/repoScanner";

const repoRoot = path.resolve(process.cwd(), "../..");

describe("RAG-informed evidence priority", () => {
  it("adds browser smoke evidence without removing existing requirements", async () => {
    const { graph } = await scanRepository(repoRoot);
    const basePlan = planEvidence({
      graph,
      affectedCapabilityIds: ["api_apply_discount", "route_checkout"],
    });
    const context = acceptedContext();
    const elevatedPlan = planEvidence({
      graph,
      affectedCapabilityIds: ["api_apply_discount", "route_checkout"],
      historicalRiskContexts: [context],
    });

    expect(elevatedPlan.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "req_api_apply_discount_invalid_discount",
          type: "existing_test",
        }),
      ]),
    );
    expect(elevatedPlan.requirements.length).toBeGreaterThan(
      basePlan.requirements.length,
    );
    expect(elevatedPlan.missingEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceType: "browser_smoke",
          target: "/checkout",
          sourceContextIds: [context.context_id],
        }),
      ]),
    );
  });

  it("does not let historical risk context set a merge decision", () => {
    const context = acceptedContext() as unknown as Record<string, unknown>;

    expect(context.decision).toBeUndefined();
    expect(context.should_block).toBeUndefined();
    expect(context.should_merge).toBeUndefined();
  });

  it("rejects a current-PR modified ADR for evidence priority", () => {
    const chunks = [
      fakeChunk("adr_modified", "adr", {
        trust_tier: "trusted_for_decision_context",
        trusted_for_current_run: false,
      }),
      fakeChunk("incident", "incident", {
        trust_tier: "retrieval_only",
      }),
    ];
    const contexts = buildHistoricalRiskContextsFromRetrieval({
      affectedCapabilityIds: ["api_apply_discount", "route_checkout"],
      chunks,
      retrievalResults: retrievalResultsFor(chunks),
      retrievalDecision: "HAS_RELEVANT_CONTEXT",
      retrievalReason: "test",
    });

    expect(contexts.some((context) => context.validation_status === "accepted"))
      .toBe(false);
  });

  it("does not let context-only sources raise evidence priority", () => {
    const chunks = [
      fakeChunk("doc", "doc", {
        trust_tier: "context_only",
      }),
      fakeChunk("incident", "incident", {
        trust_tier: "retrieval_only",
      }),
    ];
    const contexts = buildHistoricalRiskContextsFromRetrieval({
      affectedCapabilityIds: ["api_apply_discount", "route_checkout"],
      chunks,
      retrievalResults: retrievalResultsFor(chunks),
      retrievalDecision: "HAS_RELEVANT_CONTEXT",
      retrievalReason: "test",
    });

    expect(contexts.some((context) => context.evidence_implication === "require_browser_smoke"))
      .toBe(false);
  });

  it("does not produce historical risk context for no-answer retrieval", () => {
    const contexts = buildHistoricalRiskContextsFromRetrieval({
      affectedCapabilityIds: ["api_apply_discount", "route_checkout"],
      chunks: [],
      retrievalResults: [],
      retrievalDecision: "NO_RELEVANT_CONTEXT",
      retrievalReason: "no positive signal",
    });

    expect(contexts).toEqual([]);
  });

  it("requires accepted context citations to come from retrieved chunks", () => {
    const chunks = [
      fakeChunk("adr", "adr", {
        trust_tier: "trusted_for_decision_context",
      }),
      fakeChunk("incident", "incident", {
        trust_tier: "retrieval_only",
      }),
    ];
    const contexts = buildHistoricalRiskContextsFromRetrieval({
      affectedCapabilityIds: ["api_apply_discount", "route_checkout"],
      chunks,
      retrievalResults: retrievalResultsFor([chunks[0]]),
      retrievalDecision: "HAS_RELEVANT_CONTEXT",
      retrievalReason: "test",
    });

    expect(contexts.some((context) => context.validation_status === "accepted"))
      .toBe(false);
  });

  it("keeps Decision Engine deterministic for RAG-elevated missing evidence", async () => {
    const { graph } = await scanRepository(repoRoot);
    const context = acceptedContext();
    const evidencePlan = planEvidence({
      graph,
      affectedCapabilityIds: ["api_apply_discount", "route_checkout"],
      historicalRiskContexts: [context],
    });
    const executionResult: EvidenceExecutionResult = {
      results: [],
      artifactPath: path.join(repoRoot, "artifacts/releaseguard/test/evidence_result.json"),
      testResultsPath: path.join(repoRoot, "artifacts/releaseguard/test/test_results.json"),
    };

    expect(decide({ graph, evidencePlan, executionResult })).toEqual({
      decision: "WARN",
      reason:
        "trusted repo memory raised evidence requirement, but required browser evidence is missing.",
    });
  });

  it("demo-rag-elevated-evidence outputs WARN and reports historical context", async () => {
    const result = await runReleaseGuard({
      rootDir: repoRoot,
      fixture: "demo-rag-elevated-evidence",
    });
    const report = await fs.readFile(result.reportPath, "utf8");

    expect(result.decision).toEqual({
      decision: "WARN",
      reason:
        "trusted repo memory raised evidence requirement, but required browser evidence is missing.",
    });
    expect(result.historicalRiskContexts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          validation_status: "accepted",
          evidence_implication: "require_browser_smoke",
        }),
      ]),
    );
    expect(report).toContain("Decision: WARN");
    expect(report).toContain("Historical risk context");
    expect(report).toContain("Checkout Critical Flow");
    expect(report).toContain("Discount Validation Crash");
    expect(report).toContain("browser_smoke");
    expect(report).toContain("/checkout");
  }, 20_000);
});

function acceptedContext(): HistoricalRiskContext {
  return {
    context_id: "hrc_test",
    affected_capability_ids: ["api_apply_discount", "route_checkout"],
    source_chunk_ids: ["adr", "incident"],
    source_types: ["adr", "incident"],
    trust_tier: "trusted_for_decision_context",
    summary:
      "Trusted repo memory retrieved ADR 0007: Checkout Critical Flow and 2024-08 Discount Validation Crash.",
    evidence_implication: "require_browser_smoke",
    validation_status: "accepted",
    reason: "test accepted context",
  };
}

function fakeChunk(
  id: string,
  sourceType: RepoMemorySourceType,
  overrides: Partial<RepoMemoryChunk> = {},
): RepoMemoryChunk {
  return {
    chunk_id: id,
    source_type: sourceType,
    title:
      sourceType === "adr"
        ? "ADR 0007: Checkout Critical Flow"
        : sourceType === "incident"
          ? "2024-08 Discount Validation Crash"
          : "General checkout note",
    text: "checkout discount invalid discount critical revenue path incident",
    file_path:
      sourceType === "adr"
        ? "docs/adr/0007-checkout-critical-flow.md"
        : sourceType === "incident"
          ? "docs/incidents/2024-08-discount-crash.md"
          : "docs/notes/context-only.md",
    heading_path: [],
    related_capability_ids: ["api_apply_discount", "route_checkout"],
    related_file_paths: [],
    tagging_status: "tagged",
    tagging_confidence: "medium",
    tagging_basis: "test",
    trust_tier:
      sourceType === "adr" ? "trusted_for_decision_context" : "retrieval_only",
    trusted_for_current_run: true,
    index_version: "repo-memory-v0.2",
    ...overrides,
  };
}

function retrievalResultsFor(chunks: RepoMemoryChunk[]): MemoryRetrievalResult[] {
  return chunks.map((chunk, index) => ({
    chunk_id: chunk.chunk_id,
    rank: index + 1,
    score: 1 / (index + 1),
    retriever: "capability_guarded_rrf_hybrid",
  }));
}
