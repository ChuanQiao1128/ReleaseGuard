import { ScannerCoverage } from "./types";
import { renderSuggestedOverrideSnippet, suggestOverrides } from "./overrideSuggestion";

export function renderCoverageReport(coverage: ScannerCoverage): string {
  const suggestions = suggestOverrides({
    coverage,
    unresolvedCallsites: coverage.unresolvedCallsites,
  });
  const lines: string[] = [
    "# ReleaseGuard Scanner Coverage",
    "",
    `Scanned files: ${coverage.scannedFiles.length}`,
    "",
    "## Detected routes",
    ...listOrNone(
      coverage.detectedRoutes.map(
        (route) => `- ${route.id}: ${route.target} (${route.filePath})`,
      ),
    ),
    "",
    "## Detected APIs",
    ...listOrNone(
      coverage.detectedApis.map(
        (api) => `- ${api.id}: ${api.target} (${api.filePath})`,
      ),
    ),
    "",
    "## Detected frontend->API callsites",
    ...listOrNone(
      coverage.resolvedCallsites.map(
        (callsite) =>
          `- ${callsite.confidence}: ${callsite.routeId} consumes ${callsite.apiId} at ${callsite.filePath}:${callsite.line} (${callsite.confidenceBasis})`,
      ),
    ),
    "",
    "## Unresolved callsites",
    ...listOrNone(
      coverage.unresolvedCallsites.map(
        (callsite) =>
          `- ${callsite.filePath}:${callsite.line}: ${callsite.reason}`,
      ),
    ),
    "",
    "## Confidence breakdown",
    `- high: ${coverage.confidenceBreakdown.high}`,
    `- medium: ${coverage.confidenceBreakdown.medium}`,
    `- low: ${coverage.confidenceBreakdown.low}`,
    `- unresolved: ${coverage.confidenceBreakdown.unresolved}`,
    "",
    "## Suggested override snippets",
    ...renderSuggestedOverrideSnippet(suggestions),
    "",
    "## Limitations",
    ...coverage.limitations.map((limitation) => `- ${limitation}`),
    "",
  ];

  return lines.join("\n");
}

function listOrNone(items: string[]): string[] {
  return items.length > 0 ? items : ["- None"];
}
