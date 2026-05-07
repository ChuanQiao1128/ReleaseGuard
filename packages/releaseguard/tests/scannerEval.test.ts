import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderSuggestedOverrideSnippet, suggestOverrides } from "../src/scanner/overrideSuggestion";
import { runScannerEval } from "../src/scanner/scannerEval";
import { ScannerCoverage, UnresolvedCallsite } from "../src/scanner/types";
import { classifyUnresolvedPattern } from "../src/scanner/unresolvedPatternClassifier";

const repoRoot = path.resolve(process.cwd(), "../..");

describe("scanner eval", () => {
  it("writes scanner eval artifacts for the demo app", async () => {
    const result = await runScannerEval({
      workspaceRoot: repoRoot,
      repoRoot,
    });
    const report = await fs.readFile(result.report_path, "utf8");
    const unresolved = JSON.parse(
      await fs.readFile(result.unresolved_report_path, "utf8"),
    ) as {
      unresolved_callsite_rate: number;
      adapter_contribution: {
        universal_fallback_nodes: number;
        framework_capability_nodes: number;
      };
    };

    expect(result.supported).toBe(true);
    expect(result.routes_detected).toBeGreaterThanOrEqual(1);
    expect(result.apis_detected).toBeGreaterThanOrEqual(1);
    expect(result.tests_detected).toBeGreaterThanOrEqual(1);
    expect(result.resolved_callsites).toBeGreaterThanOrEqual(1);
    expect(result.graph_path).toBeDefined();
    expect(report).toContain("ReleaseGuard Scanner Eval");
    expect(report).toContain("Detected routes");
    expect(report).toContain("Detected frontend->API callsites");
    expect(report).toContain("Resolution level distribution");
    expect(report).toContain("Adapter contribution");
    expect(report).toContain("Fail-safe implication");
    expect(unresolved.unresolved_callsite_rate).toBe(result.unresolved_rate);
    expect(unresolved.adapter_contribution.framework_capability_nodes).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("includes optional coverage evidence in scanner eval reports", async () => {
    const result = await runScannerEval({
      workspaceRoot: repoRoot,
      repoRoot,
      coverageFile: "packages/releaseguard/fixtures/coverage/lcov.info",
    });
    const report = await fs.readFile(result.report_path, "utf8");
    const unresolved = JSON.parse(
      await fs.readFile(result.unresolved_report_path, "utf8"),
    ) as {
      coverage?: {
        provider: string;
        matched_file_count: number;
        matched_files: string[];
      };
    };

    expect(result.coverage_file_count).toBe(3);
    expect(result.coverage_matched_file_count).toBeGreaterThanOrEqual(2);
    expect(result.resolution_level_distribution.L4_TEST_EVIDENCE_MAPPED).toBeGreaterThan(
      0,
    );
    expect(report).toContain("## Coverage evidence");
    expect(report).toContain("coverage shows a file was executed by tests");
    expect(report).toContain(
      "apps/demo-app/src/app/api/discount/apply/route.ts",
    );
    expect(unresolved.coverage?.provider).toBe("lcov");
    expect(unresolved.coverage?.matched_files).toContain(
      "apps/demo-app/src/app/api/discount/apply/route.ts",
    );
  });

  it("writes unsupported framework reports instead of crashing", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "releaseguard-unsupported-"));
    await fs.writeFile(path.join(tempRoot, "package.json"), "{}\n");

    const result = await runScannerEval({
      workspaceRoot: repoRoot,
      repoRoot: tempRoot,
    });
    const report = await fs.readFile(result.report_path, "utf8");

    expect(result.supported).toBe(false);
    expect(result.scanner_error_count).toBe(1);
    expect(result.top_unresolved_patterns).toContainEqual({
      pattern: "unsupported_framework",
      count: 1,
    });
    expect(report).toContain("Supported by current scanner: no");
    expect(report).toContain("unsupported_framework");
    expect(report).toContain("Universal fallback nodes");
    expect(report).toContain("Route/API precision is unavailable");
    expect(result.universal_fallback_nodes).toBeGreaterThan(0);
    expect(result.resolution_level_distribution.L0_CHANGED_FILE_ONLY).toBeGreaterThan(
      0,
    );
  });

  it("classifies unresolved callsite patterns", () => {
    expect(patternFor("fetch(`/api/${slug}`)")).toBe("template_literal");
    expect(patternFor("axios.post('/api/discount/apply')")).toBe("axios_wrapper");
    expect(patternFor("api.discount.apply({ code })")).toBe("trpc_client");
    expect(patternFor("gql`query Viewer { viewer { id } }`")).toBe(
      "graphql_operation",
    );
    expect(patternFor("client.discount.apply(code)")).toBe("generated_client");
    expect(patternFor("fetch(url)")).toBe("dynamic_url");
  });

  it("renders suggested override snippets for unresolved checkout/discount calls", () => {
    const coverage: ScannerCoverage = {
      scannedFiles: [],
      detectedRoutes: [
        {
          id: "route_checkout",
          target: "/checkout",
          filePath: "apps/demo-app/src/app/checkout/page.tsx",
        },
      ],
      detectedApis: [
        {
          id: "api_apply_discount",
          target: "POST /api/discount/apply",
          filePath: "apps/demo-app/src/app/api/discount/apply/route.ts",
        },
      ],
      resolvedCallsites: [],
      unresolvedCallsites: [],
      confidenceBreakdown: {
        high: 0,
        medium: 0,
        low: 0,
        unresolved: 0,
      },
      limitations: [],
    };
    const unresolved: UnresolvedCallsite[] = [
      {
        filePath: "apps/demo-app/src/app/checkout/page.tsx",
        line: 12,
        reason: "Unsupported generated client call.",
        quote: "client.discount.apply({ code })",
        confidence: "unresolved",
        pattern: "generated_client",
      },
    ];

    const suggestions = suggestOverrides({ coverage, unresolvedCallsites: unresolved });
    expect(suggestions).toEqual([
      expect.objectContaining({
        routeId: "route_checkout",
        apiId: "api_apply_discount",
      }),
    ]);
    expect(renderSuggestedOverrideSnippet(suggestions).join("\n")).toContain(
      "route_checkout",
    );
  });
});

function patternFor(quote: string) {
  return classifyUnresolvedPattern({
    quote,
    reason: "test unresolved",
  });
}
