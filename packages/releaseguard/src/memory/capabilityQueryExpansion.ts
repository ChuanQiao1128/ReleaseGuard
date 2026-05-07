import { CapabilityGraph, CapabilityNode } from "../graph/types";

export type CapabilityQueryExpansion = {
  original_query: string;
  expanded_query: string;
  expansion_terms: string[];
  matched_capability_ids: string[];
};

const CAPABILITY_QUERY_ALIASES: Record<string, string[]> = {
  api_apply_discount: [
    "api_apply_discount",
    "discount",
    "apply discount",
    "discount validation",
    "invalid discount",
    "discount code",
    "cart total",
    "POST /api/discount/apply",
    "ADR",
    "incident",
  ],
  route_checkout: [
    "route_checkout",
    "checkout",
    "checkout route",
    "checkout flow",
    "critical flow",
    "critical revenue path",
    "/checkout",
    "ADR",
    "incident",
  ],
};

export function expandQueryWithCapabilities(args: {
  query: string;
  capabilityIds?: string[];
  graph?: CapabilityGraph;
}): CapabilityQueryExpansion {
  const matchedCapabilityIds = validCapabilityIds({
    capabilityIds: args.capabilityIds ?? [],
    graph: args.graph,
  });
  const terms = new Map<string, string>();

  for (const capabilityId of matchedCapabilityIds) {
    for (const term of capabilityTerms(capabilityId, args.graph?.nodes[capabilityId])) {
      const normalized = normalizeTerm(term);
      if (normalized.length > 0 && !terms.has(normalized)) {
        terms.set(normalized, term.trim());
      }
    }
  }

  const expansionTerms = [...terms.values()];
  return {
    original_query: args.query,
    expanded_query:
      expansionTerms.length === 0
        ? args.query
        : `${args.query} ${expansionTerms.join(" ")}`,
    expansion_terms: expansionTerms,
    matched_capability_ids: matchedCapabilityIds,
  };
}

function validCapabilityIds(args: {
  capabilityIds: string[];
  graph?: CapabilityGraph;
}): string[] {
  const seen = new Set<string>();
  return args.capabilityIds.filter((capabilityId) => {
    if (seen.has(capabilityId)) {
      return false;
    }
    seen.add(capabilityId);
    if (args.graph) {
      return Boolean(args.graph.nodes[capabilityId]);
    }
    return Boolean(CAPABILITY_QUERY_ALIASES[capabilityId]);
  });
}

function capabilityTerms(
  capabilityId: string,
  node: CapabilityNode | undefined,
): string[] {
  const metadataAliases = Array.isArray(node?.metadata.aliases)
    ? node.metadata.aliases.filter((value): value is string => typeof value === "string")
    : [];
  return [
    capabilityId,
    node?.name ?? "",
    node?.target ?? "",
    node?.filePath ?? "",
    ...metadataAliases,
    ...(CAPABILITY_QUERY_ALIASES[capabilityId] ?? []),
  ].filter((term) => term.trim().length > 0);
}

function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}
