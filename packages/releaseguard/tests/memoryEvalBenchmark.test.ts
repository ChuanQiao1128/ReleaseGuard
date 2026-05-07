import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  generateRagEvalDataset,
  writeRagEvalDataset,
} from "../src/memory/evalDataset";
import { runRagBenchmark } from "../src/memory/benchmark";
import { writeRagDemoDiscountContext } from "../src/memory/demoDiscountContext";
import { writeRepoMemoryIndex } from "../src/memory/memoryIndex";

const repoRoot = path.resolve(process.cwd(), "../..");

describe("Repo Memory eval, benchmark, and demo reports", () => {
  it("generates deterministic eval items from demo memory", async () => {
    const { chunks } = await writeRepoMemoryIndex(repoRoot);
    const first = generateRagEvalDataset(chunks);
    const second = generateRagEvalDataset(chunks);

    expect(first).toEqual(second);
    expect(first.some((item) => item.query_type === "direct")).toBe(true);
    expect(first.some((item) => item.query_type === "near_miss")).toBe(true);
    expect(first.some((item) => item.query_type === "no_answer")).toBe(true);
    expect(first.filter((item) => item.query_type === "no_answer")).toHaveLength(5);
    for (const item of first.filter((entry) => entry.gold_chunk_ids.length > 0)) {
      for (const chunkId of item.gold_chunk_ids) {
        expect(chunks.some((chunk) => chunk.chunk_id === chunkId)).toBe(true);
      }
    }
    expect(
      first
        .filter((item) => item.query_type === "no_answer")
        .every((item) => item.gold_chunk_ids.length === 0),
    ).toBe(true);
  });

  it("writes rag_eval_dataset.json", async () => {
    const result = await writeRagEvalDataset(repoRoot);

    expect(result.items.length).toBeGreaterThan(0);
    await expect(fs.stat(result.outputPath)).resolves.toBeDefined();
  });

  it("benchmark writes markdown and json with all baselines", async () => {
    const result = await runRagBenchmark(repoRoot);

    expect(result.results.map((entry) => entry.retriever).sort()).toEqual([
      "bm25",
      "capability_guarded_rrf_hybrid",
      "embedding",
      "guarded_rrf_hybrid",
      "rrf_hybrid",
    ]);
    expect(result.query_type_counts.direct).toBeGreaterThan(0);
    expect(result.query_type_counts.paraphrase).toBeGreaterThan(0);
    expect(result.query_type_counts.near_miss).toBeGreaterThan(0);
    expect(result.query_type_counts.no_answer).toBeGreaterThanOrEqual(5);
    for (const entry of result.results) {
      expect(entry.metrics).toHaveProperty("recall_at_5");
      expect(entry.metrics).toHaveProperty("mrr");
      expect(entry.metrics).toHaveProperty("no_answer_false_positive_rate");
      expect(entry.metrics).toHaveProperty("no_answer_abstention_rate");
      expect(entry.metrics).toHaveProperty("false_abstention_rate");
    }
    const guarded = result.results.find(
      (entry) => entry.retriever === "guarded_rrf_hybrid",
    );
    const capabilityGuarded = result.results.find(
      (entry) => entry.retriever === "capability_guarded_rrf_hybrid",
    );
    expect(guarded?.metrics.no_answer_abstention_rate).toBeGreaterThan(0);
    expect(guarded?.metrics.false_abstention_count).toBeGreaterThanOrEqual(0);
    expect(capabilityGuarded?.metrics.no_answer_false_positive_rate).toBeLessThanOrEqual(
      guarded?.metrics.no_answer_false_positive_rate ?? 1,
    );
    expect(capabilityGuarded?.metrics.false_abstention_count).toBeLessThanOrEqual(
      guarded?.metrics.false_abstention_count ?? 0,
    );
    expect(result.guarded_thresholds_used).toMatchObject({
      bm25MinTopScore: expect.any(Number),
      minQueryTokenOverlap: expect.any(Number),
      minQueryTokenOverlapRatio: expect.any(Number),
      embeddingMinTopScore: expect.any(Number),
      sharedTopRankLimit: expect.any(Number),
    });
    expect(
      result.abstention_examples.no_answer_correct_abstentions.length,
    ).toBeGreaterThan(0);
    expect(result.citation_validation_eval).toMatchObject({
      valid_retrieved_citation_passed: true,
      nonexistent_chunk_rejected: true,
      outside_retrieval_set_rejected: true,
      untrusted_decision_context_rejected: true,
    });

    const markdown = await fs.readFile(result.markdown_report_path, "utf8");
    expect(markdown).toContain("ReleaseGuard Repo Memory RAG Benchmark v0.2");
    expect(markdown).toContain("## Dataset");
    expect(markdown).toContain("| Query type | Count |");
    expect(markdown).toContain("## Retriever Comparison");
    expect(markdown).toContain("No-answer FPR");
    expect(markdown).toContain("No-answer abstention");
    expect(markdown).toContain("## Interpretation");
    expect(markdown).toContain("BM25 is strong in this repo-memory corpus");
    expect(markdown).toContain("deterministic embedding baseline is local");
    expect(markdown).toContain("Guarded RRF hybrid adds deterministic abstention");
    expect(markdown).toContain("Capability-aware guarded RRF");
    expect(markdown).toContain(
      "No-answer handling is required before RAG context can safely influence evidence priority",
    );
    expect(markdown).toContain("## Guarded Retriever Calibration");
    expect(markdown).toContain("False abstention count");
    expect(markdown).toContain("### Thresholds Used");
    expect(markdown).toContain("BM25 minimum top score");
    expect(markdown).toContain("RRF guard rule");
    expect(markdown).toContain("Capability-aware expansion rule");
    expect(markdown).toContain("No-answer queries correctly abstained");
    expect(markdown).toContain("Answerable queries incorrectly abstained");
    expect(markdown).toContain("Citation Validation Eval");
    expect(markdown).toContain("Limitations");
    expect(markdown).toContain(
      "small demo-corpus benchmark, not a production retrieval benchmark",
    );
    await expect(fs.stat(result.json_report_path)).resolves.toBeDefined();
  });

  it("discount context demo report retrieves checkout and discount history", async () => {
    const result = await writeRagDemoDiscountContext(repoRoot);
    const markdown = await fs.readFile(result.reportPath, "utf8");

    expect(markdown).toContain("Checkout critical ADR");
    expect(markdown).toContain("Discount incident");
    expect(markdown).toContain("does not change PASS/WARN/BLOCK");
    expect(markdown).toContain("Original query:");
    expect(markdown).toContain("Expanded query terms:");
    expect(markdown).toContain("Matched capability IDs:");
    expect(markdown).toContain("Guarded retrieval decision:");
    expect(markdown).toContain("docs/adr/0007-checkout-critical-flow.md");
    expect(markdown).toContain("docs/incidents/2024-08-discount-crash.md");
  });
});
