import { promises as fs } from "node:fs";
import path from "node:path";
import {
  addEdge,
  addFileNode,
  addNode,
  makeEdge,
  sanitizeIdPart,
  toRepoRelativePath,
} from "../graph/capabilityGraph";
import { CapabilityGraph, CapabilityNode } from "../graph/types";
import { emptyResolutionLevelCounts } from "../impact/resolutionLevel";
import { pathExists } from "./fileUtils";
import { FileRole, ScannerCoverage } from "./types";

const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".releaseguard",
  "artifacts",
  "coverage",
  "dist",
  "node_modules",
]);

const SOURCE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".go",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scala",
  ".swift",
  ".ts",
  ".tsx",
]);

export async function scanUniversalFiles(
  rootDir: string,
  graph: CapabilityGraph,
  coverage: ScannerCoverage,
): Promise<void> {
  const files = await listRepoFiles(rootDir);
  coverage.scannedFiles = uniqueSorted([
    ...coverage.scannedFiles,
    ...files.map((filePath) => toRepoRelativePath(rootDir, filePath)),
  ]);

  for (const absolutePath of files) {
    const relativePath = toRepoRelativePath(rootDir, absolutePath);
    const role = classifyFileRole(relativePath);
    const fileNode = addFileNode(graph, rootDir, absolutePath, "universal_file_scan");
    fileNode.metadata = {
      ...fileNode.metadata,
      fileRole: role,
      resolutionLevel: "L0_CHANGED_FILE_ONLY",
    };
    incrementFileRole(coverage, role);

    const moduleId = moduleNodeId(relativePath);
    if (moduleId) {
      const moduleNode = ensureModuleNode(graph, moduleId, modulePath(relativePath));
      addEdge(
        graph,
        makeEdge(
          fileNode.id,
          "belongs_to",
          moduleNode.id,
          "medium",
          "universal_directory_module",
          [
            {
              filePath: relativePath,
              reason: "File belongs to a repository directory/module boundary.",
            },
          ],
          { resolutionLevel: "L1_MODULE_MAPPED" },
        ),
      );
    }
  }

  coverage.resolutionLevelCounts = {
    ...emptyResolutionLevelCounts(),
    ...coverage.resolutionLevelCounts,
    L0_CHANGED_FILE_ONLY: files.length,
  };
}

export function classifyFileRole(filePath: string): FileRole {
  const normalized = filePath.replace(/\\/g, "/");
  const basename = path.posix.basename(normalized);
  const extension = path.posix.extname(normalized).toLowerCase();

  if (/^docs\//.test(normalized) || /\.mdx?$/i.test(normalized)) {
    return "docs";
  }
  if (/generated|__generated__|\.generated\.|\/gen\//i.test(normalized)) {
    return "generated";
  }
  if (
    basename === "package.json" ||
    basename === "package-lock.json" ||
    basename === "pnpm-lock.yaml" ||
    basename === "yarn.lock" ||
    basename === "requirements.txt" ||
    basename === "pyproject.toml" ||
    basename === "go.mod" ||
    basename === "go.sum" ||
    basename === "pom.xml" ||
    basename === "build.gradle" ||
    basename === "build.gradle.kts"
  ) {
    return basename.includes("lock") ||
      basename === "requirements.txt" ||
      basename === "go.sum"
      ? "dependency"
      : "config";
  }
  if (
    /^\.env/.test(basename) ||
    basename === "Dockerfile" ||
    /(^|\/)(tsconfig|next\.config|vite\.config|jest\.config|vitest\.config)/.test(
      normalized,
    )
  ) {
    return "config";
  }
  if (
    /(^|\/)(test|tests|__tests__|spec)\//.test(normalized) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized) ||
    /_test\.go$/.test(normalized) ||
    /test_.*\.py$/.test(basename)
  ) {
    return "test";
  }
  if (SOURCE_EXTENSIONS.has(extension)) {
    return "source";
  }
  return "unknown";
}

async function listRepoFiles(rootDir: string): Promise<string[]> {
  if (!(await pathExists(rootDir))) {
    return [];
  }
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        await walk(absolutePath);
        continue;
      }
      if (entry.isFile()) {
        results.push(absolutePath);
      }
    }
  }

  await walk(rootDir);
  return results.sort();
}

function ensureModuleNode(
  graph: CapabilityGraph,
  id: string,
  target: string,
): CapabilityNode {
  const existing = graph.nodes[id];
  if (existing) {
    return existing;
  }
  const node: CapabilityNode = {
    id,
    type: "module",
    name: target,
    target,
    risk: "medium",
    confidence: "medium",
    confidenceBasis: "universal_directory_module",
    evidenceRefs: [
      {
        filePath: target,
        reason: "Directory boundary was inferred as a universal module.",
      },
    ],
    metadata: {
      resolutionLevel: "L1_MODULE_MAPPED",
    },
  };
  addNode(graph, node);
  return node;
}

function moduleNodeId(filePath: string): string | undefined {
  const module = modulePath(filePath);
  return module ? `module_${sanitizeIdPart(module)}` : undefined;
}

function modulePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.length <= 1) {
    return ".";
  }
  if (parts[0] === "apps" || parts[0] === "packages" || parts[0] === "services") {
    return parts.slice(0, Math.min(parts.length - 1, 2)).join("/");
  }
  return parts[0];
}

function incrementFileRole(coverage: ScannerCoverage, role: FileRole): void {
  coverage.fileRoleCounts = coverage.fileRoleCounts ?? {};
  coverage.fileRoleCounts[role] = (coverage.fileRoleCounts[role] ?? 0) + 1;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
