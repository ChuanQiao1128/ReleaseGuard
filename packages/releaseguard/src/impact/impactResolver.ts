import { analyzeScope } from "../diff/scopeAnalyzer";
import {
  findDefinedCapabilitiesForFile,
  normalizePath,
} from "../graph/capabilityGraph";
import { CapabilityGraph, CapabilityNode } from "../graph/types";
import {
  ResolutionLevel,
  maxResolutionLevel,
} from "./resolutionLevel";

export type ImpactResolutionItem = {
  filePath: string;
  fileRole: string;
  resolutionLevel: ResolutionLevel;
  mappedNodeIds: string[];
  reason: string;
};

export type ImpactResolutionResult = {
  items: ImpactResolutionItem[];
  highestResolutionLevel: ResolutionLevel;
  unresolvedChanges: ImpactResolutionItem[];
  failSafeWarn: boolean;
  reason?: string;
};

export function resolveImpact(input: {
  changedFiles: string[];
  graph: CapabilityGraph;
}): ImpactResolutionResult {
  let highestResolutionLevel: ResolutionLevel = "L0_CHANGED_FILE_ONLY";
  const items: ImpactResolutionItem[] = input.changedFiles.map((filePath) => {
    const item = resolveChangedFile(filePath, input.graph);
    highestResolutionLevel = maxResolutionLevel(
      highestResolutionLevel,
      item.resolutionLevel,
    );
    return item;
  });
  const unresolvedChanges = items.filter((item) =>
    shouldFailSafeWarn(item, input.changedFiles),
  );
  return {
    items,
    highestResolutionLevel,
    unresolvedChanges,
    failSafeWarn: unresolvedChanges.length > 0,
    reason: unresolvedChanges[0]?.reason,
  };
}

function resolveChangedFile(
  filePath: string,
  graph: CapabilityGraph,
): ImpactResolutionItem {
  const normalized = normalizePath(filePath);
  const defined = findDefinedCapabilitiesForFile(graph, normalized);
  const fileNode = Object.values(graph.nodes).find(
    (node) => node.type === "file" && node.filePath === normalized,
  );
  const fileRole = String(fileNode?.metadata.fileRole ?? inferRole(normalized));
  const moduleNodes = findBelongingModules(graph, fileNode?.id);

  if (defined.some(isDeclaredEvidenceTest)) {
    return item({
      filePath: normalized,
      fileRole,
      resolutionLevel: "L5_DECLARED_CAPABILITY_MAPPED",
      mappedNodeIds: defined.map((node) => node.id),
      reason: "Changed file has declared ReleaseGuard test evidence.",
    });
  }
  if (defined.some((node) => node.type === "test")) {
    return item({
      filePath: normalized,
      fileRole,
      resolutionLevel: "L4_TEST_EVIDENCE_MAPPED",
      mappedNodeIds: defined.map((node) => node.id),
      reason: "Changed file maps to test evidence.",
    });
  }
  if (defined.some((node) => node.type === "route" || node.type === "api")) {
    return item({
      filePath: normalized,
      fileRole,
      resolutionLevel: "L3_FRAMEWORK_CAPABILITY_MAPPED",
      mappedNodeIds: defined.map((node) => node.id),
      reason: "Changed file maps to framework route/API capability.",
    });
  }
  if (
    defined.some((node) => node.type === "package" || node.type === "module") ||
    moduleNodes.length > 0
  ) {
    return item({
      filePath: normalized,
      fileRole,
      resolutionLevel: "L1_MODULE_MAPPED",
      mappedNodeIds: [
        ...defined.map((node) => node.id),
        ...moduleNodes.map((node) => node.id),
      ],
      reason: "Changed file maps to a package/module boundary only.",
    });
  }
  return item({
    filePath: normalized,
    fileRole,
    resolutionLevel: "L0_CHANGED_FILE_ONLY",
    mappedNodeIds: fileNode ? [fileNode.id] : [],
    reason:
      fileRole === "source" || fileRole === "test"
        ? "source change could not be mapped to known capability."
        : "Changed file is known only at file-level precision.",
  });
}

function item(input: ImpactResolutionItem): ImpactResolutionItem {
  return input;
}

function isDeclaredEvidenceTest(node: CapabilityNode): boolean {
  return node.type === "test" && node.metadata.evidenceDeclaration === true;
}

function findBelongingModules(
  graph: CapabilityGraph,
  fileNodeId: string | undefined,
): CapabilityNode[] {
  if (!fileNodeId) {
    return [];
  }
  return Object.values(graph.edges)
    .filter((edge) => edge.type === "belongs_to" && edge.source === fileNodeId)
    .map((edge) => graph.nodes[edge.target])
    .filter((node): node is CapabilityNode => Boolean(node));
}

function shouldFailSafeWarn(
  item: ImpactResolutionItem,
  changedFiles: string[],
): boolean {
  const scope = analyzeScope(changedFiles);
  if (scope.classification === "docs_only") {
    return false;
  }
  if (
    item.resolutionLevel === "L0_CHANGED_FILE_ONLY" ||
    item.resolutionLevel === "L1_MODULE_MAPPED"
  ) {
    return item.fileRole === "source" ||
      item.fileRole === "test" ||
      item.fileRole === "config" ||
      item.fileRole === "dependency" ||
      item.fileRole === "unknown";
  }
  return false;
}

function inferRole(filePath: string): string {
  if (/\.mdx?$/i.test(filePath) || /^docs\//.test(filePath)) {
    return "docs";
  }
  if (/package(-lock)?\.json$|go\.mod$|pyproject\.toml$|pom\.xml$|build\.gradle/.test(filePath)) {
    return "config";
  }
  if (/\.(test|spec)\.[cm]?[jt]sx?$|_test\.go$|test_.*\.py$/.test(filePath)) {
    return "test";
  }
  if (/\.(ts|tsx|js|jsx|py|go|java|rb|rs|cs)$/.test(filePath)) {
    return "source";
  }
  return "unknown";
}
