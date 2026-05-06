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
      "embedding",
      "rrf_hybrid",
    ]);
    for (const entry of result.results) {
      expect(entry.metrics).toHaveProperty("recall_at_5");
      expect(entry.metrics).toHaveProperty("mrr");
      expect(entry.metrics).toHaveProperty("no_answer_false_positive_rate");
    }
    expect(result.citation_validation_eval).toMatchObject({
      valid_retrieved_citation_passed: true,
      nonexistent_chunk_rejected: true,
      outside_retrieval_set_rejected: true,
      untrusted_decision_context_rejected: true,
    });

    const markdown = await fs.readFile(result.markdown_report_path, "utf8");
    expect(markdown).toContain("ReleaseGuard Repo Memory RAG Benchmark v0.2");
    expect(markdown).toContain("Citation Validation Eval");
    expect(markdown).toContain("Limitations");
    await expect(fs.stat(result.json_report_path)).resolves.toBeDefined();
  });

  it("discount context demo report retrieves checkout and discount history", async () => {
    const result = await writeRagDemoDiscountContext(repoRoot);
    const markdown = await fs.readFile(result.reportPath, "utf8");

    expect(markdown).toContain("Checkout critical ADR");
    expect(markdown).toContain("Discount incident");
    expect(markdown).toContain("does not change PASS/WARN/BLOCK");
    expect(markdown).toContain("docs/adr/0007-checkout-critical-flow.md");
    expect(markdown).toContain("docs/incidents/2024-08-discount-crash.md");
  });
});
