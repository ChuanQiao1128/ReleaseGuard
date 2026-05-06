import path from "node:path";
import { describe, expect, it } from "vitest";
import { retrieveWithBm25 } from "../src/memory/bm25Retriever";
import {
  DeterministicLocalEmbeddingProvider,
  cosineSimilarity,
} from "../src/memory/embeddingProvider";
import { retrieveWithEmbeddings } from "../src/memory/embeddingRetriever";
import { guardedRetrieveWithRrf } from "../src/memory/guardedRetriever";
import { fuseWithRrf, RRF_K } from "../src/memory/rrfRetriever";
import { applyTemporalDecay } from "../src/memory/temporalDecay";
import { writeRepoMemoryIndex } from "../src/memory/memoryIndex";
import { RepoMemoryChunk } from "../src/memory/types";

const repoRoot = path.resolve(process.cwd(), "../..");

describe("Repo Memory retrievers", () => {
  it("loads noisy demo memory while preserving discount-related chunks", async () => {
    const { chunks } = await writeRepoMemoryIndex(repoRoot);

    expect(chunks.length).toBeGreaterThan(20);
    expect(chunks.some((chunk) => chunk.file_path.includes("pagination"))).toBe(
      true,
    );
    expect(chunks.some((chunk) => /discount/i.test(chunk.text))).toBe(true);
  });

  it("BM25 returns discount incident or checkout ADR for discount checkout crash", async () => {
    const { chunks } = await writeRepoMemoryIndex(repoRoot);

    const results = retrieveWithBm25({
      chunks,
      query: "discount checkout crash",
      limit: 5,
    });
    const topPaths = results
      .map((result) => chunks.find((chunk) => chunk.chunk_id === result.chunk_id))
      .map((chunk) => chunk?.file_path ?? "");

    expect(topPaths).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/discount-crash|checkout-critical-flow/),
      ]),
    );
  });

  it("BM25 returns unrelated relevant docs for unrelated queries", async () => {
    const { chunks } = await writeRepoMemoryIndex(repoRoot);

    const results = retrieveWithBm25({
      chunks,
      query: "auth token leak",
      limit: 3,
    });
    const topChunk = chunks.find((chunk) => chunk.chunk_id === results[0].chunk_id);

    expect(topChunk?.file_path).toContain("auth-token-leak");
  });

  it("BM25 filters by related capability ids", async () => {
    const { chunks } = await writeRepoMemoryIndex(repoRoot);

    const results = retrieveWithBm25({
      chunks,
      query: "discount checkout crash",
      filters: {
        related_capability_ids: ["api_apply_discount"],
      },
      limit: 10,
    });

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      const chunk = chunks.find((item) => item.chunk_id === result.chunk_id);
      expect(chunk?.related_capability_ids).toContain("api_apply_discount");
    }
  });

  it("retrievers handle empty query and corpus safely", async () => {
    await expect(
      retrieveWithEmbeddings({ chunks: [], query: "discount" }),
    ).resolves.toEqual([]);
    expect(retrieveWithBm25({ chunks: [], query: "discount" })).toEqual([]);
    expect(retrieveWithBm25({ chunks: [fakeChunk("one")], query: "" })).toEqual([]);
  });

  it("deterministic embeddings are stable and useful locally", async () => {
    const provider = new DeterministicLocalEmbeddingProvider();

    const first = await provider.embed("discount checkout crash");
    const second = await provider.embed("discount checkout crash");
    const unrelated = await provider.embed("profile settings");

    expect(first).toEqual(second);
    expect(cosineSimilarity(first, second)).toBeCloseTo(1);
    expect(cosineSimilarity(first, unrelated)).toBeLessThan(1);
  });

  it("embedding retriever returns relevant chunks without external API keys", async () => {
    const { chunks } = await writeRepoMemoryIndex(repoRoot);

    const results = await retrieveWithEmbeddings({
      chunks,
      query: "discount checkout crash",
      limit: 5,
    });
    const paths = results
      .map((result) => chunks.find((chunk) => chunk.chunk_id === result.chunk_id))
      .map((chunk) => chunk?.file_path ?? "");

    expect(paths).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/discount-crash|checkout-critical-flow/),
      ]),
    );
  });

  it("RRF combines BM25 and embedding results deterministically with k=60", () => {
    expect(RRF_K).toBe(60);

    const first = fuseWithRrf({
      bm25Results: [
        { chunk_id: "shared", score: 10, rank: 1, retriever: "bm25" },
        { chunk_id: "bm25_only", score: 5, rank: 2, retriever: "bm25" },
      ],
      embeddingResults: [
        { chunk_id: "shared", score: 9, rank: 1, retriever: "embedding" },
        { chunk_id: "embedding_only", score: 8, rank: 2, retriever: "embedding" },
      ],
    });
    const second = fuseWithRrf({
      bm25Results: [
        { chunk_id: "shared", score: 10, rank: 1, retriever: "bm25" },
        { chunk_id: "bm25_only", score: 5, rank: 2, retriever: "bm25" },
      ],
      embeddingResults: [
        { chunk_id: "shared", score: 9, rank: 1, retriever: "embedding" },
        { chunk_id: "embedding_only", score: 8, rank: 2, retriever: "embedding" },
      ],
    });

    expect(first).toEqual(second);
    expect(first[0]).toMatchObject({
      chunk_id: "shared",
      component_ranks: {
        bm25_rank: 1,
        embedding_rank: 1,
      },
    });
  });

  it("temporal decay ranks recent incidents above equally relevant old incidents", () => {
    const recent = fakeChunk("recent", {
      source_type: "incident",
      created_at: "2026-04-01T00:00:00.000Z",
    });
    const old = fakeChunk("old", {
      source_type: "incident",
      created_at: "2023-01-01T00:00:00.000Z",
    });
    const adr = fakeChunk("adr", {
      source_type: "adr",
      created_at: "2020-01-01T00:00:00.000Z",
    });
    const noDate = fakeChunk("no-date");

    expect(applyTemporalDecay(1, recent)).toBeGreaterThan(
      applyTemporalDecay(1, old),
    );
    expect(applyTemporalDecay(1, adr)).toBe(1);
    expect(applyTemporalDecay(1, noDate)).toBe(1);
  });

  it("guarded retrieval abstains on no-answer queries", async () => {
    const { chunks } = await writeRepoMemoryIndex(repoRoot);

    const result = await guardedRetrieveWithRrf({
      chunks,
      query: "How do we handle WebSocket reconnection?",
    });

    expect(result).toMatchObject({
      decision: "NO_RELEVANT_CONTEXT",
      retriever: "guarded_rrf_hybrid",
    });
    expect(result.results).toEqual([]);
  });

  it("guarded retrieval returns discount and checkout context", async () => {
    const { chunks } = await writeRepoMemoryIndex(repoRoot);

    const result = await guardedRetrieveWithRrf({
      chunks,
      query: "discount checkout crash",
      limit: 5,
    });
    const paths = result.results
      .map((item) => chunks.find((chunk) => chunk.chunk_id === item.chunk_id))
      .map((chunk) => chunk?.file_path ?? "");

    expect(result.decision).toBe("HAS_RELEVANT_CONTEXT");
    expect(paths).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/discount-crash|checkout-critical-flow/),
      ]),
    );
  });

  it("guarded retrieval handles an empty corpus", async () => {
    await expect(
      guardedRetrieveWithRrf({
        chunks: [],
        query: "discount checkout crash",
      }),
    ).resolves.toMatchObject({
      decision: "NO_RELEVANT_CONTEXT",
      results: [],
    });
  });
});

function fakeChunk(
  id: string,
  overrides: Partial<RepoMemoryChunk> = {},
): RepoMemoryChunk {
  return {
    chunk_id: id,
    source_type: "doc",
    title: id,
    text: id,
    file_path: `docs/${id}.md`,
    heading_path: [id],
    related_capability_ids: [],
    related_file_paths: [],
    tagging_status: "unresolved",
    tagging_confidence: "unresolved",
    tagging_basis: "test",
    trust_tier: "context_only",
    trusted_for_current_run: true,
    index_version: "test",
    ...overrides,
  };
}
