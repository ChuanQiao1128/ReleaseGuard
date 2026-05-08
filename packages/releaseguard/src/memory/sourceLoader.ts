import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizePath, toRepoRelativePath } from "../graph/capabilityGraph";
import { chunkMarkdownFile } from "./markdownChunker";
import { RepoMemoryChunk, RepoMemorySourceType } from "./types";

const IGNORED_DIR_NAMES = new Set([
  ".git",
  "artifacts",
  "coverage",
  "dist",
  "node_modules",
  "sample_reports",
  "scanner_eval",
]);

const SOURCE_ROOTS = ["docs", ".releaseguard/reports"];
const IGNORED_MARKDOWN_FILE_NAMES = new Set(["external_quickstart.md"]);

export async function loadRepoMemoryChunks(
  rootDir: string,
): Promise<RepoMemoryChunk[]> {
  const markdownFiles: string[] = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    markdownFiles.push(
      ...(await listMarkdownFilesIfPresent(path.join(rootDir, sourceRoot))),
    );
  }

  const chunks: RepoMemoryChunk[] = [];
  for (const absolutePath of markdownFiles.sort()) {
    const markdown = await fs.readFile(absolutePath, "utf8");
    if (markdown.trim().length === 0) {
      continue;
    }
    const relativePath = toRepoRelativePath(rootDir, absolutePath);
    chunks.push(
      ...chunkMarkdownFile({
        filePath: relativePath,
        sourceType: sourceTypeForPath(relativePath),
        markdown,
      }),
    );
  }

  return chunks;
}

async function listMarkdownFilesIfPresent(rootDir: string): Promise<string[]> {
  try {
    const stat = await fs.stat(rootDir);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return listMarkdownFiles(rootDir);
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIR_NAMES.has(entry.name)) {
        continue;
      }
      files.push(...(await listMarkdownFiles(absolutePath)));
      continue;
    }

    if (
      entry.isFile() &&
      /\.md$/i.test(entry.name) &&
      !/^rag_/i.test(entry.name) &&
      !IGNORED_MARKDOWN_FILE_NAMES.has(entry.name)
    ) {
      files.push(absolutePath);
    }
  }

  return files;
}

export function sourceTypeForPath(filePath: string): RepoMemorySourceType {
  const normalized = normalizePath(filePath);
  if (/^docs\/adr\//.test(normalized)) {
    return "adr";
  }
  if (/^docs\/incidents\//.test(normalized)) {
    return "incident";
  }
  if (/^\.releaseguard\/reports\//.test(normalized)) {
    return "releaseguard_report";
  }
  return "doc";
}
