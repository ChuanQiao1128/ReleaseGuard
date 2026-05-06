import path from "node:path";
import { describe, expect, it } from "vitest";
import { decide } from "../src/decision/decisionEngine";
import { planEvidence } from "../src/evidence/evidencePlanner";
import { EvidencePlan } from "../src/evidence/types";
import { EvidenceExecutionResult } from "../src/executor/selectedTestExecutor";
import { renderMarkdownReport } from "../src/report/markdownReport";
import { scanRepository } from "../src/scanner/repoScanner";

const repoRoot = path.resolve(process.cwd(), "../..");

describe("decision engine and markdown report", () => {
  it("returns BLOCK when selected evidence fails", async () => {
    const { graph } = await scanRepository(repoRoot);
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
      artifactPath: path.join(repoRoot, "artifacts/releaseguard/test/evidence_result.json"),
      testResultsPath: path.join(repoRoot, "artifacts/releaseguard/test/test_results.json"),
    };

    expect(
      decide({
        graph,
        evidencePlan,
        executionResult,
      }),
    ).toEqual({
      decision: "BLOCK",
      reason: "selected high-priority evidence failed.",
    });
  });

  it("returns WARN when high-risk required evidence is missing", async () => {
    const { graph } = await scanRepository(repoRoot);
    const evidencePlan: EvidencePlan = {
      requirements: [],
      selectedEvidence: [],
      missingEvidence: [
        {
          requirementId: "req_api_apply_discount_invalid_discount",
          capabilityId: "api_apply_discount",
          reason:
            "No direct API test had invalid_discount, 400, and error_status tags.",
          requiredTags: ["invalid_discount", "400", "error_status"],
        },
      ],
    };
    const executionResult: EvidenceExecutionResult = {
      results: [],
      artifactPath: path.join(
        repoRoot,
        "artifacts/releaseguard/test/evidence_result.json",
      ),
      testResultsPath: path.join(
        repoRoot,
        "artifacts/releaseguard/test/test_results.json",
      ),
    };

    expect(
      decide({
        graph,
        evidencePlan,
        executionResult,
      }),
    ).toEqual({
      decision: "WARN",
      reason: "high-risk capability has missing required evidence.",
    });
  });


  it("renders the BLOCK report golden output", async () => {
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
      artifactPath: path.join(repoRoot, "artifacts/releaseguard/test/evidence_result.json"),
      testResultsPath: path.join(repoRoot, "artifacts/releaseguard/test/test_results.json"),
    };
    const report = renderMarkdownReport({
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

    expect(report).toMatchInlineSnapshot(`
      "# ReleaseGuard Report

      Decision: BLOCK

      ## Changed files
      Fixture: demo-discount-regression
      - apps/demo-app/src/app/api/discount/apply/route.ts

      ## Affected capabilities
      - api_apply_discount: POST /api/discount/apply (api)
      - route_checkout: /checkout (route)

      ## Selected evidence
      - test_api_discount_invalid: tests/api/discount.test.ts for api_apply_discount (invalid_discount, error_status, 400)

      ## Missing evidence
      - None

      ## Test results
      - tests/api/discount.test.ts: FAILED (exit 1, 10ms)

      ## Decision rationale
      - selected high-priority evidence failed.

      ## Scanner coverage
      - Capability graph: .releaseguard/capability_graph.json
      - Coverage report: .releaseguard/coverage_report.md

      ## Artifacts
      - Report directory: artifacts/releaseguard/test
      - Evidence result: artifacts/releaseguard/test/evidence_result.json
      - Test results: artifacts/releaseguard/test/test_results.json
      "
    `);
  });
});
