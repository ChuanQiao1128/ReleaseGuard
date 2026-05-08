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
import { scanPackageManifests } from "./packageManifestScanner";
import { scanUniversalFiles } from "./universalFileScanner";
import { scanViteReactRouterRoutes } from "./viteReactRouterRouteScanner";
import { scanAxiosCallsites } from "./axiosCallsiteScanner";
import { buildViteRouteToApiEdges } from "./viteRouteImportGraph";

export async function scanRepository(rootDir: string): Promise<{
  graph: CapabilityGraph;
  result: ScannerResult;
}> {
  const framework = await detectFramework(rootDir);
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
    fileRoleCounts: {},
    resolutionLevelCounts: {},
    limitations: [
      "v0.4 resolves direct fetch string literals, flat endpoint constants, and simple local fetcher/SWR literals.",
      "Template literals, axios wrappers, tRPC, GraphQL, generated clients, OpenAPI clients, and complex dynamic URLs are unresolved.",
      "v0.5 always builds universal file/module/package fallback context before framework-specific scanning.",
      "Monorepos and deep workspace graph traversal are outside current scanner scope.",
      "v0.1 selects direct API tests only; transitive route evidence is reported as a limitation.",
    ],
  };

  await scanUniversalFiles(rootDir, graph, coverage);
  await scanPackageManifests(rootDir, graph, coverage);

  if (framework.kind === "nextjs_app_router" && framework.isTypeScript) {
    const scanned = await listFiles(framework.appRoot, (filePath) =>
      /\.(ts|tsx)$/.test(filePath),
    );
    coverage.scannedFiles = [
      ...new Set([
        ...coverage.scannedFiles,
        ...scanned.map((filePath) => toRepoRelativePath(rootDir, filePath)),
      ]),
    ].sort();

    const routes = await scanNextRoutes(rootDir, framework.appDir, graph, coverage);
    const apis = await scanNextApis(rootDir, framework.appDir, graph, coverage);
    await scanFetchLiterals(rootDir, graph, routes, apis, coverage);
    await scanTests(rootDir, framework.appRoot, graph);
  } else if (framework.kind === "vite_react_router") {
    const scanned = await listFiles(framework.appRoot, (filePath) =>
      /\.(ts|tsx|js|jsx)$/.test(filePath),
    );
    coverage.scannedFiles = [
      ...new Set([
        ...coverage.scannedFiles,
        ...scanned.map((filePath) => toRepoRelativePath(rootDir, filePath)),
      ]),
    ].sort();

    const viteRoutes = await scanViteReactRouterRoutes(
      rootDir,
      framework.appRoot,
      graph,
      coverage,
    );
    await scanAxiosCallsites(rootDir, framework.appRoot, graph, coverage);
    await scanTests(rootDir, framework.appRoot, graph);
    await buildViteRouteToApiEdges({
      rootDir,
      appRoot: framework.appRoot,
      routes: viteRoutes,
      graph,
      coverage,
    });
    coverage.limitations.push(
      "Vite + React Router adapter v1 resolves JSX <Route>, createBrowserRouter / useRoutes object routes, axios calls with literal URLs, and route -> api edges via local import graph traversal. Path aliases, dynamic clients, non-literal URLs, and non-relative imports are unresolved.",
    );
  } else {
    coverage.limitations.push(
      "Framework-specific route/API scanner did not run; universal file/module/package fallback is the current precision level.",
    );
  }

  updateConfidenceBreakdown(graph, coverage);

  const { graphPath, coveragePath } = await writeScannerArtifacts(
    rootDir,
    graph,
    coverage,
  );

  return {
    graph,
    result: {
      graphPath,
      coveragePath,
      coverage,
    },
  };
}

async function writeScannerArtifacts(
  rootDir: string,
  graph: CapabilityGraph,
  coverage: ScannerCoverage,
): Promise<{ graphPath: string; coveragePath: string }> {
  const releaseguardDir = path.join(rootDir, ".releaseguard");
  await fs.mkdir(releaseguardDir, { recursive: true });
  const graphPath = path.join(releaseguardDir, "capability_graph.json");
  const coveragePath = path.join(releaseguardDir, "coverage_report.md");
  await fs.writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);
  await fs.writeFile(coveragePath, renderCoverageReport(coverage));
  return { graphPath, coveragePath };
}

function updateConfidenceBreakdown(
  graph: CapabilityGraph,
  coverage: ScannerCoverage,
): void {
  let frameworkCapabilities = 0;
  let testEvidence = 0;
  let declaredEvidence = 0;
  for (const node of Object.values(graph.nodes)) {
    coverage.confidenceBreakdown[node.confidence] += 1;
    if (node.type === "route" || node.type === "api") {
      frameworkCapabilities += 1;
    }
    if (node.type === "test") {
      testEvidence += 1;
      if (node.metadata.evidenceDeclaration === true) {
        declaredEvidence += 1;
      }
    }
  }
  for (const edge of Object.values(graph.edges)) {
    coverage.confidenceBreakdown[edge.confidence] += 1;
  }
  coverage.confidenceBreakdown.unresolved += coverage.unresolvedCallsites.length;
  coverage.resolutionLevelCounts = {
    ...coverage.resolutionLevelCounts,
    L3_FRAMEWORK_CAPABILITY_MAPPED:
      (coverage.resolutionLevelCounts?.L3_FRAMEWORK_CAPABILITY_MAPPED ?? 0) +
      frameworkCapabilities,
    L4_TEST_EVIDENCE_MAPPED:
      (coverage.resolutionLevelCounts?.L4_TEST_EVIDENCE_MAPPED ?? 0) +
      testEvidence,
    L5_DECLARED_CAPABILITY_MAPPED:
      (coverage.resolutionLevelCounts?.L5_DECLARED_CAPABILITY_MAPPED ?? 0) +
      declaredEvidence,
  };
}
