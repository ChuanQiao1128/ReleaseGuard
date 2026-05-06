import { promises as fs } from "node:fs";
import path from "node:path";
import { scanRepository } from "../scanner/repoScanner";
import { tagRepoMemoryChunks } from "./capabilityTagger";
import { applyRepoMemoryTrustPolicy } from "./trustPolicy";
import { loadRepoMemoryChunks } from "./sourceLoader";
import { RepoMemoryChunk } from "./types";

export type RepoMemoryIndexResult = {
  chunks: RepoMemoryChunk[];
  outputPath: string;
};

export async function writeRepoMemoryIndex(
  rootDir: string,
  options: {
    modifiedFiles?: string[];
    skipGraphScan?: boolean;
  } = {},
): Promise<RepoMemoryIndexResult> {
  const chunks = await loadRepoMemoryChunks(rootDir);
  const graph = options.skipGraphScan
    ? undefined
    : await scanRepository(rootDir)
        .then((result) => result.graph)
        .catch(() => undefined);
  const taggedChunks = tagRepoMemoryChunks(chunks, {
    graph,
    modifiedFiles: options.modifiedFiles,
  });
  const trustedChunks = applyRepoMemoryTrustPolicy(taggedChunks, {
    modifiedFiles: options.modifiedFiles,
  });
  const releaseguardDir = path.join(rootDir, ".releaseguard");
  await fs.mkdir(releaseguardDir, { recursive: true });
  const outputPath = path.join(releaseguardDir, "memory_chunks.json");
  await fs.writeFile(outputPath, `${JSON.stringify(trustedChunks, null, 2)}\n`);
  return {
    chunks: trustedChunks,
    outputPath,
  };
}
