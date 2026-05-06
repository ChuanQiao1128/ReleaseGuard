import {
  findDefinedCapabilitiesForFile,
  normalizePath,
} from "../graph/capabilityGraph";
import { CapabilityGraph, CapabilityNode } from "../graph/types";
import { RepoMemoryChunk } from "./types";

const FILE_PATH_PATTERN =
  /\b(?:apps|packages)\/[A-Za-z0-9._/-]+\.(?:ts|tsx|js|jsx|md)\b/g;

const CAPABILITY_ALIASES: Record<string, string[]> = {
  api_apply_discount: [
    "api apply discount",
    "apply discount",
    "discount api",
    "discount validation",
    "invalid discount",
    "discount code",
    "cart total",
    "/api/discount/apply",
  ],
  route_checkout: ["checkout", "checkout route", "/checkout", "checkout flow"],
};

export type TagRepoMemoryOptions = {
  graph?: CapabilityGraph;
  modifiedFiles?: string[];
};

export function tagRepoMemoryChunks(
  chunks: RepoMemoryChunk[],
  options: TagRepoMemoryOptions,
): RepoMemoryChunk[] {
  return chunks.map((chunk) => tagRepoMemoryChunk(chunk, options));
}

export function tagRepoMemoryChunk(
  chunk: RepoMemoryChunk,
  options: TagRepoMemoryOptions,
): RepoMemoryChunk {
  const modifiedFiles = new Set(
    (options.modifiedFiles ?? []).map((filePath) => normalizePath(filePath)),
  );
  const trustedForCurrentRun = !modifiedFiles.has(normalizePath(chunk.file_path));

  if (!options.graph) {
    return {
      ...chunk,
      tagging_status: "unresolved",
      tagging_confidence: "unresolved",
      tagging_basis: "capability_graph_unavailable",
      trusted_for_current_run: trustedForCurrentRun,
      untrusted_reason: trustedForCurrentRun
        ? undefined
        : "source_modified_in_current_pr",
    };
  }
  const graph = options.graph;

  const capabilityIds = new Set<string>();
  const relatedFilePaths = new Set<string>();
  let basis = "no_capability_match";
  let confidence: RepoMemoryChunk["tagging_confidence"] = "unresolved";

  for (const filePath of extractFilePaths(chunk.text)) {
    relatedFilePaths.add(filePath);
    for (const capability of findDefinedCapabilitiesForFile(graph, filePath)) {
      capabilityIds.add(capability.id);
    }
  }

  if (capabilityIds.size > 0) {
    basis = "direct_file_path";
    confidence = "high";
  } else {
    for (const capability of findKeywordCapabilityMatches(graph, chunk)) {
      capabilityIds.add(capability.id);
    }
    if (capabilityIds.size > 0) {
      basis = "keyword_match";
      confidence = "medium";
    }
  }

  const validCapabilityIds = [...capabilityIds].filter((id) =>
    Boolean(graph.nodes[id]),
  );

  return {
    ...chunk,
    related_capability_ids: validCapabilityIds,
    related_file_paths: [...relatedFilePaths],
    tagging_status: validCapabilityIds.length > 0 ? "tagged" : "unresolved",
    tagging_confidence: validCapabilityIds.length > 0 ? confidence : "unresolved",
    tagging_basis: validCapabilityIds.length > 0 ? basis : "no_capability_match",
    trusted_for_current_run: trustedForCurrentRun,
    untrusted_reason: trustedForCurrentRun
      ? undefined
      : "source_modified_in_current_pr",
  };
}

export function extractFilePaths(text: string): string[] {
  return [...new Set(text.match(FILE_PATH_PATTERN) ?? [])].map((filePath) =>
    normalizePath(filePath),
  );
}

function findKeywordCapabilityMatches(
  graph: CapabilityGraph,
  chunk: RepoMemoryChunk,
): CapabilityNode[] {
  const haystack = [
    chunk.title,
    chunk.text,
    chunk.heading_path.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return Object.values(graph.nodes).filter((node) => {
    if (node.type !== "api" && node.type !== "route") {
      return false;
    }
    const aliases = capabilityAliases(node);
    return aliases.some((alias) => haystack.includes(alias.toLowerCase()));
  });
}

function capabilityAliases(node: CapabilityNode): string[] {
  return [
    node.id,
    node.name,
    node.target ?? "",
    ...(CAPABILITY_ALIASES[node.id] ?? []),
  ].filter(Boolean);
}
