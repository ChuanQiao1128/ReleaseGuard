import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { planEvidence } from "../src/evidence/evidencePlanner";
import { EvidenceExecutionResult } from "../src/executor/selectedTestExecutor";
import { renderHtmlReport } from "../src/report/htmlReport";
import { runReleaseGuard } from "../src/run";
import { scanRepository } from "../src/scanner/repoScanner";

const repoRoot = path.resolve(process.cwd(), "../..");

describe("HTML report", () => {
  it("renders a static HTML report with core merge evidence sections", async () => {
    const { graph, result } = await scanRepository(repoRoot);
    const evidencePlan = planEvidence({
      graph,
      affectedCapabilityIds: ["api_apply_discount"],
    });
    const executionResult: EvidenceExecutionResult = {
      results: [
        {
          testFile: "tests/api/discount.test.ts",
          command: "npm test -- tests/api/discount.test.ts",
          cwd: "apps/demo-app",
          exitCode: 1,
          stdout: "expected 500 to be 400",
          stderr: "",
          durationMs: 10,
          outcome: "failed",
        },
      ],
      artifactPath: path.join(
        repoRoot,
        "artifacts/releaseguard/test/evidence_result.json",
      ),
      testResultsPath: path.join(
        repoRoot,
        "artifacts/releaseguard/test/test_results.json",
      ),
    };

    const html = renderHtmlReport({
      graph,
      scope: {
        mode: "fixture",
        fixture: "demo-discount-regression",
        changedFiles: ["apps/demo-app/src/app/api/discount/apply/route.ts"],
        docsOnly: false,
      },
      impact: {
        affected_capability_ids: ["api_apply_discount", "route_checkout"],
        rationale_per_capability: {},
        citations: [],
        unresolved_items: [],
      },
      evidencePlan,
      executionResult,
      decision: {
        decision: "BLOCK",
        reason: "selected high-priority evidence failed.",
      },
      graphPath: result.graphPath,
      coveragePath: result.coveragePath,
      artifactDir: path.join(repoRoot, "artifacts/releaseguard/test"),
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('class="decision block"');
    expect(html).toContain("Decision: BLOCK");
    expect(html).toContain("api_apply_discount");
    expect(html).toContain("route_checkout");
    expect(html).toContain("tests/api/discount.test.ts");
    expect(html).toContain("Coverage evidence");
    expect(html).toContain("report.html");
  });

  it("writes an HTML report artifact for docs-only runs", async () => {
    const result = await runReleaseGuard({
      rootDir: repoRoot,
      fixture: "demo-docs-only",
    });

    expect(result.htmlReportPath.endsWith("report.html")).toBe(true);
    const html = await fs.readFile(result.htmlReportPath, "utf8");
    expect(html).toContain("Decision: PASS");
    expect(html).toContain("Fixture: demo-docs-only");
    expect(html).toContain("Skipped for low-risk docs-only change.");
  });
});
