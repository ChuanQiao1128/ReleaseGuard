import { promises as fs } from "node:fs";
import path from "node:path";
import { scanRepository } from "../scanner/repoScanner";
import { retrieveWithBm25 } from "./bm25Retriever";
import { retrieveWithEmbeddings } from "./embeddingRetriever";
import { writeRepoMemoryIndex } from "./memoryIndex";
import { fuseWithRrf } from "./rrfRetriever";
import { RepoMemoryChunk } from "./types";

export type RagDemoDiscountContextResult = {
  reportPath: string;
  retrievedChunkIds: string[];
};

export async function writeRagDemoDiscountContext(
  rootDir: string,
): Promise<RagDemoDiscountContextResult> {
  const index = await writeRepoMemoryIndex(rootDir);
  const bm25Results = retrieveWithBm25({
    chunks: index.chunks,
    query: discountContextQuery(),
    filters: { source_type: ["adr", "incident"] },
    limit: 10,
  });
  const embeddingResults = await retrieveWithEmbeddings({
    chunks: index.chunks,
    query: discountContextQuery(),
    filters: { source_type: ["adr", "incident"] },
    limit: 10,
  });
  const hybridResults = fuseWithRrf({
    bm25Results,
    embeddingResults,
    limit: 5,
  });
  const incidentResults = retrieveWithBm25({
    chunks: index.chunks,
    query: "2024 discount validation crash incident invalid discount HTTP 500",
    filters: { source_type: ["incident"] },
    limit: 3,
  });
  const checkoutAdrResults = retrieveWithBm25({
    chunks: index.chunks,
    query: "checkout critical revenue path ADR direct evidence",
    filters: { source_type: ["adr"] },
    limit: 3,
  });
  const retrievedChunkIds = uniqueChunkIds([
    ...hybridResults.map((result) => result.chunk_id),
    ...incidentResults.map((result) => result.chunk_id),
    ...checkoutAdrResults.map((result) => result.chunk_id),
  ]).slice(0, 10);
  const graphCapabilities = await scanRepository(rootDir)
    .then((result) =>
      Object.values(result.graph.nodes)
        .filter((node) =>
          ["api_apply_discount", "route_checkout"].includes(node.id),
        )
        .map((node) => `${node.id} (${node.target ?? node.filePath ?? "n/a"})`),
    )
    .catch(() => ["api_apply_discount", "route_checkout"]);

  const reportsDir = path.join(rootDir, ".releaseguard", "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, "rag_demo_discount_context.md");
  await fs.writeFile(
    reportPath,
    renderDiscountContextReport({
      rootDir,
      chunks: index.chunks,
      graphCapabilities,
      retrievedChunkIds,
    }),
  );
  return {
    reportPath,
    retrievedChunkIds,
  };
}

function renderDiscountContextReport(args: {
  rootDir: string;
  chunks: RepoMemoryChunk[];
  graphCapabilities: string[];
  retrievedChunkIds: string[];
}): string {
  const chunksById = new Map(args.chunks.map((chunk) => [chunk.chunk_id, chunk]));
  const retrievedChunks = args.retrievedChunkIds
    .map((chunkId) => chunksById.get(chunkId))
    .filter((chunk): chunk is RepoMemoryChunk => Boolean(chunk));

  return [
    "# ReleaseGuard v0.2 Discount Context Demo",
    "",
    "Graph for structured dependencies. RAG for unstructured repo memory.",
    "",
    "## Graph-only affected capabilities",
    "",
    ...args.graphCapabilities.map((capability) => `- ${capability}`),
    "",
    "## RAG retrieved repo memory",
    "",
    ...retrievedChunks.map(
      (chunk, index) =>
        [
          `${index + 1}. ${chunk.title}`,
          `   - Source: ${chunk.file_path}`,
          `   - Trust tier: ${chunk.trust_tier}`,
          `   - Related capabilities: ${chunk.related_capability_ids.join(", ") || "none"}`,
        ].join("\n"),
    ),
    "",
    "## Historical risk context",
    "",
    "- Checkout critical ADR: checkout is treated as a critical revenue path and requires direct evidence for checkout-impacting changes.",
    "- Discount incident: invalid discount handling previously caused checkout failures, so discount validation has historical checkout risk.",
    "",
    "## v0.2 boundary",
    "",
    "This RAG context is report-only in v0.2. It does not change evidence requirements and does not change PASS/WARN/BLOCK decisions.",
    "",
  ].join("\n");
}

function discountContextQuery(): string {
  return "discount validation checkout crash invalid discount historical risk";
}

function uniqueChunkIds(chunkIds: string[]): string[] {
  return [...new Set(chunkIds)];
}
