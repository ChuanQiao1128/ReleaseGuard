import { promises as fs } from "node:fs";
import path from "node:path";
import { CapabilityGraph } from "../graph/types";
import { ResolutionLevelCounts, emptyResolutionLevelCounts } from "../impact/resolutionLevel";
import { detectFramework } from "./frameworkDetector";
import { renderSuggestedOverrideSnippet, suggestOverrides, SuggestedOverride } from "./overrideSuggestion";
import { scanRepository } from "./repoScanner";
import { ScannerCoverage, UnresolvedCallsite } from "./types";
import {
  classifyUnresolvedPattern,
  UnresolvedPatternCategory,
} from "./unresolvedPatternClassifier";

export type ScannerEvalResult = {
  repo_path: string;
  framework_detected: string;
  supported: boolean;
  scanned_file_count: number;
  routes_detected: number;
  apis_detected: number;
  tests_detected: number;
  frontend_api_callsites_detected: number;
  resolved_callsites: number;
  unresolved_callsites: number;
  unresolved_rate: number;
  scanner_error_count: number;
  top_unresolved_patterns: Array<{
    pattern: UnresolvedPatternCategory;
    count: number;
  }>;
  file_role_counts: Record<string, number>;
  resolution_level_distribution: ResolutionLevelCounts;
  suggested_overrides: SuggestedOverride[];
  output_dir: string;
  report_path: string;
  graph_path?: string;
  unresolved_report_path: string;
};

export async function runScannerEval(args: {
  workspaceRoot: string;
  repoRoot: string;
}): Promise<ScannerEvalResult> {
  const repoRoot = path.resolve(args.repoRoot);
  const outputDir = path.join(
    args.workspaceRoot,
    ".releaseguard",
    "scanner_eval",
    sanitizeRepoName(path.basename(repoRoot) || "repo"),
  );
  await fs.mkdir(outputDir, { recursive: true });

  const framework = await detectFramework(repoRoot);
  const frameworkDetected = framework.isNextAppRouter
    ? `nextjs_app_router${framework.isTypeScript ? "_typescript" : ""}`
    : "unsupported_framework";

  let coverage = emptyCoverage();
  let graph: CapabilityGraph | undefined;
  let scannerError: string | undefined;

  try {
    const scan = await scanRepository(repoRoot);
    coverage = {
      ...scan.result.coverage,
      unresolvedCallsites: scan.result.coverage.unresolvedCallsites.map(
        withPattern,
      ),
    };
    graph = scan.graph;
    if (!framework.isNextAppRouter || !framework.isTypeScript) {
      scannerError = "unsupported framework route/API adapter";
    }
  } catch (error) {
    scannerError = error instanceof Error ? error.message : String(error);
  }

  if (
    (!framework.isNextAppRouter || !framework.isTypeScript) &&
    coverage.unresolvedCallsites.length === 0
  ) {
    coverage.unresolvedCallsites.push({
      filePath: ".",
      line: 1,
      reason: "unsupported framework for route/API scanner; universal fallback ran",
      quote: frameworkDetected,
      confidence: "unresolved",
      pattern: "unsupported_framework",
    });
  }

  const unresolvedCallsites = coverage.unresolvedCallsites.map(withPattern);
  const patternCounts = unresolvedPatternCounts(unresolvedCallsites);
  const suggestions = suggestOverrides({ coverage, unresolvedCallsites });
  const graphPath = graph
    ? path.join(outputDir, "capability_graph.json")
    : undefined;
  if (graphPath) {
    await fs.writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);
  }

  const unresolvedReportPath = path.join(outputDir, "unresolved_report.json");
  await fs.writeFile(
    unresolvedReportPath,
    `${JSON.stringify({
      repo_path: repoRoot,
      framework_detected: frameworkDetected,
      unresolved_callsite_count: unresolvedCallsites.length,
      unresolved_callsite_rate: unresolvedRate(coverage),
      top_unresolved_patterns: patternCounts,
      file_role_counts: coverage.fileRoleCounts ?? {},
      resolution_level_distribution: normalizedResolutionCounts(coverage),
      unresolved_callsites: unresolvedCallsites,
      suggested_overrides: suggestions,
    }, null, 2)}\n`,
  );

  const reportPath = path.join(outputDir, "scanner_eval_report.md");
  const result: ScannerEvalResult = {
    repo_path: repoRoot,
    framework_detected: frameworkDetected,
    supported: framework.isNextAppRouter && framework.isTypeScript && !scannerError,
    scanned_file_count: coverage.scannedFiles.length,
    routes_detected: coverage.detectedRoutes.length,
    apis_detected: coverage.detectedApis.length,
    tests_detected: graph
      ? Object.values(graph.nodes).filter((node) => node.type === "test").length
      : 0,
    frontend_api_callsites_detected:
      coverage.resolvedCallsites.length + unresolvedCallsites.length,
    resolved_callsites: coverage.resolvedCallsites.length,
    unresolved_callsites: unresolvedCallsites.length,
    unresolved_rate: unresolvedRate(coverage),
    scanner_error_count: scannerError ? 1 : 0,
    top_unresolved_patterns: patternCounts,
    file_role_counts: coverage.fileRoleCounts ?? {},
    resolution_level_distribution: normalizedResolutionCounts(coverage),
    suggested_overrides: suggestions,
    output_dir: outputDir,
    report_path: reportPath,
    graph_path: graphPath,
    unresolved_report_path: unresolvedReportPath,
  };

  await fs.writeFile(
    reportPath,
    renderScannerEvalMarkdown({
      result,
      coverage: { ...coverage, unresolvedCallsites },
      scannerError,
    }),
  );

  return result;
}

function renderScannerEvalMarkdown(args: {
  result: ScannerEvalResult;
  coverage: ScannerCoverage;
  scannerError?: string;
}): string {
  return [
    "# ReleaseGuard Scanner Eval",
    "",
    `Repo path: ${args.result.repo_path}`,
    `Framework detected: ${args.result.framework_detected}`,
    `Supported by current scanner: ${args.result.supported ? "yes" : "no"}`,
    `Scanner errors: ${args.result.scanner_error_count}`,
    ...(args.scannerError ? [`Scanner error detail: ${args.scannerError}`] : []),
    "",
    "## Metrics",
    "",
    `- Scanned files: ${args.result.scanned_file_count}`,
    `- Detected routes: ${args.result.routes_detected}`,
    `- Detected APIs: ${args.result.apis_detected}`,
    `- Detected test nodes: ${args.result.tests_detected}`,
    `- Detected frontend->API callsites: ${args.result.frontend_api_callsites_detected}`,
    `- Resolved callsites: ${args.result.resolved_callsites}`,
    `- Unresolved callsites: ${args.result.unresolved_callsites}`,
    `- Unresolved rate: ${formatPercent(args.result.unresolved_rate)}`,
    "",
    "## File role counts",
    ...listOrNone(
      Object.entries(args.result.file_role_counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([role, count]) => `- ${role}: ${count}`),
    ),
    "",
    "## Resolution level distribution",
    ...Object.entries(args.result.resolution_level_distribution).map(
      ([level, count]) => `- ${level}: ${count}`,
    ),
    "",
    "## Detected routes",
    ...listOrNone(
      args.coverage.detectedRoutes.map(
        (route) => `- ${route.id}: ${route.target} (${route.filePath})`,
      ),
    ),
    "",
    "## Detected APIs",
    ...listOrNone(
      args.coverage.detectedApis.map(
        (api) => `- ${api.id}: ${api.target} (${api.filePath})`,
      ),
    ),
    "",
    "## Resolved frontend->API callsites",
    ...listOrNone(
      args.coverage.resolvedCallsites.map(
        (callsite) =>
          `- ${callsite.routeId} consumes ${callsite.apiId} at ${callsite.filePath}:${callsite.line} (${callsite.confidenceBasis})`,
      ),
    ),
    "",
    "## Unresolved callsites",
    ...listOrNone(
      args.coverage.unresolvedCallsites.map(
        (callsite) =>
          `- ${callsite.pattern ?? classifyUnresolvedPattern(callsite)}: ${callsite.filePath}:${callsite.line}: ${callsite.reason}`,
      ),
    ),
    "",
    "## Top unresolved pattern categories",
    ...listOrNone(
      args.result.top_unresolved_patterns.map(
        (entry) => `- ${entry.pattern}: ${entry.count}`,
      ),
    ),
    "",
    "## Suggested override snippets",
    ...renderSuggestedOverrideSnippet(args.result.suggested_overrides),
    "",
    "## Artifacts",
    `- Scanner eval report: ${args.result.report_path}`,
    `- Capability graph: ${args.result.graph_path ?? "not generated"}`,
    `- Unresolved report: ${args.result.unresolved_report_path}`,
    "",
  ].join("\n");
}

function unresolvedPatternCounts(unresolved: UnresolvedCallsite[]): Array<{
  pattern: UnresolvedPatternCategory;
  count: number;
}> {
  const counts = new Map<UnresolvedPatternCategory, number>();
  for (const callsite of unresolved) {
    const pattern = callsite.pattern ?? classifyUnresolvedPattern(callsite);
    counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern));
}

function unresolvedRate(coverage: ScannerCoverage): number {
  const total = coverage.resolvedCallsites.length + coverage.unresolvedCallsites.length;
  return total === 0 ? 0 : coverage.unresolvedCallsites.length / total;
}

function withPattern(callsite: UnresolvedCallsite): UnresolvedCallsite {
  return {
    ...callsite,
    pattern: callsite.pattern ?? classifyUnresolvedPattern(callsite),
  };
}

function emptyCoverage(): ScannerCoverage {
  return {
    scannedFiles: [],
    detectedRoutes: [],
    detectedApis: [],
    resolvedCallsites: [],
    unresolvedCallsites: [],
    confidenceBreakdown: {
      high: 0,
      medium: 0,
      low: 0,
      unresolved: 0,
    },
    fileRoleCounts: {},
    resolutionLevelCounts: {},
    limitations: [],
  };
}

function normalizedResolutionCounts(
  coverage: ScannerCoverage,
): ResolutionLevelCounts {
  return {
    ...emptyResolutionLevelCounts(),
    ...coverage.resolutionLevelCounts,
  };
}

function sanitizeRepoName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "-") || "repo";
}

function listOrNone(items: string[]): string[] {
  return items.length > 0 ? items : ["- None"];
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
