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
import { listFiles } from "./fileUtils";
import { ScannerCoverage } from "./types";

const MANIFEST_NAMES = new Set([
  "package.json",
  "pyproject.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
]);

export async function scanPackageManifests(
  rootDir: string,
  graph: CapabilityGraph,
  coverage: ScannerCoverage,
): Promise<void> {
  const manifests = await listFiles(rootDir, (filePath) =>
    MANIFEST_NAMES.has(path.basename(filePath)),
  );

  for (const manifestPath of manifests) {
    const relativePath = toRepoRelativePath(rootDir, manifestPath);
    const packageNode = await packageNodeForManifest(rootDir, manifestPath);
    addNode(graph, packageNode);
    const fileNode = addFileNode(
      graph,
      rootDir,
      manifestPath,
      "package_manifest_scanned",
    );
    fileNode.metadata = {
      ...fileNode.metadata,
      fileRole: "config",
      resolutionLevel: "L1_MODULE_MAPPED",
    };
    addEdge(
      graph,
      makeEdge(
        fileNode.id,
        "defines",
        packageNode.id,
        "medium",
        "package_manifest",
        [
          {
            filePath: relativePath,
            reason: "Package manifest defines a package/module boundary.",
          },
        ],
        { resolutionLevel: "L1_MODULE_MAPPED" },
      ),
    );
  }

  coverage.resolutionLevelCounts = {
    ...emptyResolutionLevelCounts(),
    ...coverage.resolutionLevelCounts,
    L1_MODULE_MAPPED:
      (coverage.resolutionLevelCounts?.L1_MODULE_MAPPED ?? 0) + manifests.length,
  };
}

async function packageNodeForManifest(
  rootDir: string,
  manifestPath: string,
): Promise<CapabilityNode> {
  const relativePath = toRepoRelativePath(rootDir, manifestPath);
  const packageDir = path.posix.dirname(relativePath);
  const manifestName = path.basename(manifestPath);
  const packageName = await inferPackageName(manifestPath, packageDir);
  return {
    id: `package_${sanitizeIdPart(packageName)}`,
    type: "package",
    name: packageName,
    target: packageDir === "." ? packageName : packageDir,
    filePath: relativePath,
    risk: "medium",
    confidence: "medium",
    confidenceBasis: "package_manifest",
    evidenceRefs: [
      {
        filePath: relativePath,
        reason: `${manifestName} defines package/module metadata.`,
      },
    ],
    metadata: {
      manifestPath: relativePath,
      manifestName,
      packageName,
      resolutionLevel: "L1_MODULE_MAPPED",
    },
  };
}

async function inferPackageName(
  manifestPath: string,
  packageDir: string,
): Promise<string> {
  const basename = path.basename(manifestPath);
  if (basename === "package.json") {
    try {
      const json = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
        name?: string;
      };
      if (json.name) {
        return json.name;
      }
    } catch {
      // Fall back to directory name below.
    }
  }
  if (basename === "go.mod") {
    const source = await fs.readFile(manifestPath, "utf8");
    const moduleMatch = /^module\s+(.+)$/m.exec(source);
    if (moduleMatch) {
      return moduleMatch[1].trim();
    }
  }
  return packageDir === "." ? path.basename(path.dirname(manifestPath)) : packageDir;
}
