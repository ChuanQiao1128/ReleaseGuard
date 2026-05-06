import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { writeRepoMemoryIndex } from "./memoryIndex";
import { RepoMemoryChunk } from "./types";

export type RagEvalQueryType = "direct" | "paraphrase" | "near_miss" | "no_answer";

export type RagEvalItem = {
  query_id: string;
  query: string;
  gold_chunk_ids: string[];
  source_chunk_id?: string;
  source_type?: RepoMemoryChunk["source_type"];
  reviewed: boolean;
  query_type: RagEvalQueryType;
};

export type RagEvalDatasetResult = {
  items: RagEvalItem[];
  outputPath: string;
};

export async function writeRagEvalDataset(
  rootDir: string,
  chunks?: RepoMemoryChunk[],
): Promise<RagEvalDatasetResult> {
  const indexed = chunks ? { chunks } : await writeRepoMemoryIndex(rootDir);
  const items = generateRagEvalDataset(indexed.chunks);
  const releaseguardDir = path.join(rootDir, ".releaseguard");
  await fs.mkdir(releaseguardDir, { recursive: true });
  const outputPath = path.join(releaseguardDir, "rag_eval_dataset.json");
  await fs.writeFile(outputPath, `${JSON.stringify(items, null, 2)}\n`);
  return { items, outputPath };
}

export function generateRagEvalDataset(chunks: RepoMemoryChunk[]): RagEvalItem[] {
  const items: RagEvalItem[] = [];
  const meaningfulChunks = chunks
    .filter((chunk) => chunk.title.trim().length > 0 && chunk.text.trim().length > 0)
    .sort((a, b) => a.chunk_id.localeCompare(b.chunk_id));

  const selectedDirectChunks = prioritizeChunks(meaningfulChunks).slice(0, 10);
  for (const chunk of selectedDirectChunks) {
    items.push(evalItem({
      query: directQuery(chunk),
      goldChunkIds: [chunk.chunk_id],
      sourceChunk: chunk,
      queryType: "direct",
    }));
  }

  const discountChunk = findChunk(
    meaningfulChunks,
    /discount/i,
    /crash|incident|checkout/i,
  );
  if (discountChunk) {
    items.push(evalItem({
      query: "historical checkout risk after invalid discount validation changes",
      goldChunkIds: [discountChunk.chunk_id],
      sourceChunk: discountChunk,
      queryType: "paraphrase",
    }));
  }

  const checkoutChunk = findChunk(
    meaningfulChunks,
    /checkout/i,
    /critical|flow|adr/i,
  );
  if (checkoutChunk) {
    items.push(evalItem({
      query: "which repo memory says checkout is a critical revenue path",
      goldChunkIds: [checkoutChunk.chunk_id],
      sourceChunk: checkoutChunk,
      queryType: "paraphrase",
    }));
  }

  const cartChunk = findChunk(meaningfulChunks, /cart/i, /quantity|rounding/i);
  if (cartChunk) {
    items.push(evalItem({
      query: "cart total quantity rounding incident",
      goldChunkIds: [cartChunk.chunk_id],
      sourceChunk: cartChunk,
      queryType: "near_miss",
    }));
  }

  items.push(evalItem({
    query: "WebSocket reconnection backoff policy",
    goldChunkIds: [],
    queryType: "no_answer",
  }));

  return dedupeByQueryId(items);
}

function prioritizeChunks(chunks: RepoMemoryChunk[]): RepoMemoryChunk[] {
  return [...chunks].sort((a, b) => {
    const scoreB = priorityScore(b);
    const scoreA = priorityScore(a);
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return a.chunk_id.localeCompare(b.chunk_id);
  });
}

function priorityScore(chunk: RepoMemoryChunk): number {
  const text = `${chunk.title} ${chunk.text} ${chunk.file_path}`.toLowerCase();
  let score = 0;
  for (const token of ["discount", "checkout", "incident", "adr", "cart", "auth"]) {
    if (text.includes(token)) {
      score += 1;
    }
  }
  return score;
}

function directQuery(chunk: RepoMemoryChunk): string {
  const keywords = chunk.heading_path.length > 0
    ? chunk.heading_path.join(" ")
    : chunk.title;
  return `${keywords} ${chunk.source_type}`.trim();
}

function findChunk(
  chunks: RepoMemoryChunk[],
  first: RegExp,
  second: RegExp,
): RepoMemoryChunk | undefined {
  return chunks.find((chunk) => {
    const haystack = `${chunk.title} ${chunk.text} ${chunk.file_path}`;
    return first.test(haystack) && second.test(haystack);
  });
}

function evalItem(args: {
  query: string;
  goldChunkIds: string[];
  sourceChunk?: RepoMemoryChunk;
  queryType: RagEvalQueryType;
}): RagEvalItem {
  return {
    query_id: `ragq_${hash(`${args.query}\n${args.goldChunkIds.join(",")}`)}`,
    query: args.query,
    gold_chunk_ids: args.goldChunkIds,
    source_chunk_id: args.sourceChunk?.chunk_id,
    source_type: args.sourceChunk?.source_type,
    reviewed: false,
    query_type: args.queryType,
  };
}

function dedupeByQueryId(items: RagEvalItem[]): RagEvalItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.query_id)) {
      return false;
    }
    seen.add(item.query_id);
    return true;
  });
}

function hash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}
