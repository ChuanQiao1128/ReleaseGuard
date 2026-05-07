import { promises as fs } from "node:fs";
import path from "node:path";
import { createCapabilityGraph, toRepoRelativePath } from "../graph/capabilityGraph";
import { CapabilityGraph } from "../graph/types";
import { renderCoverageReport } from "./coverageReport";
import { detectFramework } from "./frameworkDetector";
import { listFiles } from "./fileUtils";
import { scanFetchLiterals } from "./fetchLiteralScanner";
import { scanNextApis } from "./nextApiScanner";
import { scanNextRoutes } from "./nextRouteScanner";
import { scanTests } from "./testScanner";
import { ScannerCoverage, ScannerResult } from "./types";

export async function scanRepository(rootDir: string): Promise<{
  graph: CapabilityGraph;
  result: ScannerResult;
}> {
  const framework = await detectFramework(rootDir);
  if (!framework.isNextAppRouter || !framework.isTypeScript) {
    throw new Error("v0.1 scanner only supports the demo Next.js TypeScript app.");
  }

  const graph = createCapabilityGraph(rootDir);
  const coverage: ScannerCoverage = {
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
    limitations: [
      "v0.4 resolves direct fetch string literals, flat endpoint constants, and simple local fetcher/SWR literals.",
      "Template literals, axios wrappers, tRPC, GraphQL, generated clients, OpenAPI clients, and complex dynamic URLs are unresolved.",
      "Monorepos and workspace graph traversal are outside v0.1 scope.",
      "v0.1 selects direct API tests only; transitive route evidence is reported as a limitation.",
    ],
  };

  const scanned = await listFiles(framework.appRoot, (filePath) =>
    /\.(ts|tsx)$/.test(filePath),
  );
  coverage.scannedFiles = scanned.map((filePath) =>
    toRepoRelativePath(rootDir, filePath),
  );

  const routes = await scanNextRoutes(rootDir, framework.appDir, graph, coverage);
  const apis = await scanNextApis(rootDir, framework.appDir, graph, coverage);
  await scanFetchLiterals(rootDir, graph, routes, apis, coverage);
  await scanTests(rootDir, framework.appRoot, graph);

  updateConfidenceBreakdown(graph, coverage);

  const releaseguardDir = path.join(rootDir, ".releaseguard");
  await fs.mkdir(releaseguardDir, { recursive: true });
  const graphPath = path.join(releaseguardDir, "capability_graph.json");
  const coveragePath = path.join(releaseguardDir, "coverage_report.md");
  await fs.writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);
  await fs.writeFile(coveragePath, renderCoverageReport(coverage));

  return {
    graph,
    result: {
      graphPath,
      coveragePath,
      coverage,
    },
  };
}

function updateConfidenceBreakdown(
  graph: CapabilityGraph,
  coverage: ScannerCoverage,
): void {
  for (const node of Object.values(graph.nodes)) {
    coverage.confidenceBreakdown[node.confidence] += 1;
  }
  for (const edge of Object.values(graph.edges)) {
    coverage.confidenceBreakdown[edge.confidence] += 1;
  }
  coverage.confidenceBreakdown.unresolved += coverage.unresolvedCallsites.length;
}
