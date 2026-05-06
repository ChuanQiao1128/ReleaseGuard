import { promises as fs } from "node:fs";
import path from "node:path";
import { loadRepoMemoryChunks } from "./sourceLoader";
import { RepoMemoryChunk } from "./types";

export type RepoMemoryIndexResult = {
  chunks: RepoMemoryChunk[];
  outputPath: string;
};

export async function writeRepoMemoryIndex(
  rootDir: string,
): Promise<RepoMemoryIndexResult> {
  const chunks = await loadRepoMemoryChunks(rootDir);
  const releaseguardDir = path.join(rootDir, ".releaseguard");
  await fs.mkdir(releaseguardDir, { recursive: true });
  const outputPath = path.join(releaseguardDir, "memory_chunks.json");
  await fs.writeFile(outputPath, `${JSON.stringify(chunks, null, 2)}\n`);
  return {
    chunks,
    outputPath,
  };
}
