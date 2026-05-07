import { ScannerCoverage, UnresolvedCallsite } from "./types";

export type SuggestedOverride = {
  routeId: string;
  apiId: string;
  reason: string;
};

export function suggestOverrides(args: {
  coverage: ScannerCoverage;
  unresolvedCallsites: UnresolvedCallsite[];
}): SuggestedOverride[] {
  const suggestions: SuggestedOverride[] = [];
  const seen = new Set<string>();
  const routeCheckout = args.coverage.detectedRoutes.find(
    (route) => route.id === "route_checkout" || route.target === "/checkout",
  );
  const discountApi = args.coverage.detectedApis.find(
    (api) => api.id === "api_apply_discount" ||
      api.target === "POST /api/discount/apply",
  );
  if (!routeCheckout || !discountApi) {
    // Continue with generic suggestions below.
  } else {
    const hasCheckoutDiscountUnresolved = args.unresolvedCallsites.some((callsite) => {
      const haystack = `${callsite.filePath} ${callsite.quote} ${callsite.reason}`.toLowerCase();
      return haystack.includes("checkout") || haystack.includes("discount");
    });
    if (hasCheckoutDiscountUnresolved) {
      pushSuggestion(suggestions, seen, {
        routeId: routeCheckout.id,
        apiId: discountApi.id,
        reason:
          "Unresolved checkout/discount callsite may represent a route-to-API dependency.",
      });
    }
  }

  for (const callsite of args.unresolvedCallsites) {
    const route = inferRouteForCallsite(args.coverage, callsite);
    const api = inferApiForCallsite(args.coverage, callsite);
    if (!route || !api) {
      continue;
    }
    pushSuggestion(suggestions, seen, {
      routeId: route.id,
      apiId: api.id,
      reason: `Unresolved callsite at ${callsite.filePath}:${callsite.line} mentions ${api.target}.`,
    });
  }

  return suggestions;
}

export function renderSuggestedOverrideSnippet(
  suggestions: SuggestedOverride[],
): string[] {
  if (suggestions.length === 0) {
    return ["- None"];
  }
  const lines = ["```yaml", "suggested_overrides:", "  consumers:"];
  for (const suggestion of suggestions) {
    lines.push(`    ${suggestion.routeId}:`);
    lines.push(`      - ${suggestion.apiId}`);
  }
  lines.push("```");
  return lines;
}

function pushSuggestion(
  suggestions: SuggestedOverride[],
  seen: Set<string>,
  suggestion: SuggestedOverride,
): void {
  const key = `${suggestion.routeId}:${suggestion.apiId}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  suggestions.push(suggestion);
}

function inferRouteForCallsite(
  coverage: ScannerCoverage,
  callsite: UnresolvedCallsite,
): ScannerCoverage["detectedRoutes"][number] | undefined {
  const normalizedFile = callsite.filePath.replace(/\\/g, "/");
  const exact = coverage.detectedRoutes.find(
    (route) => route.filePath === normalizedFile,
  );
  if (exact) {
    return exact;
  }
  const haystack = `${callsite.filePath} ${callsite.quote} ${callsite.reason}`.toLowerCase();
  return coverage.detectedRoutes.find((route) => {
    const routeWords = route.target
      .split("/")
      .filter(Boolean)
      .map((part) => part.replace(/[^a-z0-9]+/gi, "").toLowerCase())
      .filter(Boolean);
    return routeWords.length > 0 && routeWords.some((word) => haystack.includes(word));
  });
}

function inferApiForCallsite(
  coverage: ScannerCoverage,
  callsite: UnresolvedCallsite,
): ScannerCoverage["detectedApis"][number] | undefined {
  const haystack = `${callsite.filePath} ${callsite.quote} ${callsite.reason}`.toLowerCase();
  const explicit = coverage.detectedApis.find((api) => {
    const target = api.target.toLowerCase();
    const apiPath = target.replace(/^[a-z]+\s+/, "");
    return haystack.includes(apiPath) || apiPath
      .split("/")
      .filter((part) => part && part !== "api")
      .some((part) => haystack.includes(part.toLowerCase()));
  });
  if (explicit) {
    return explicit;
  }
  return coverage.detectedApis.length === 1 ? coverage.detectedApis[0] : undefined;
}
