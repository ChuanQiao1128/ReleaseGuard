import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ChangeScope } from "../src/diff/diffParser";
import { analyzeScope } from "../src/diff/scopeAnalyzer";
import { applyDemoDiscountRegressionFixture } from "../src/fixtures/regressionFixture";
import { runReleaseGuardWithScope } from "../src/run";

const repoRoot = path.resolve(process.cwd(), "../..");

describe("real diff mode pipeline", () => {
  it("passes docs-only real diff scopes", async () => {
    const result = await runReleaseGuardWithScope({
      rootDir: repoRoot,
      scope: makeGitScope(["README.md"]),
    });
    const report = await fs.readFile(result.reportPath, "utf8");

    expect(result.decision).toEqual({
      decision: "PASS",
      reason: "low-risk docs-only change.",
    });
    expect(result.impact.affected_capability_ids).toHaveLength(0);
    expect(result.executionResult.results).toHaveLength(0);
    expect(report).toContain("Diff: base-ref..head-ref");
    expect(report).toContain("Decision: PASS");
    expect(report).toContain("## Selected evidence\n- None");
  });

  it("maps changed discount API files to API and checkout capabilities", async () => {
    const result = await runReleaseGuardWithScope({
      rootDir: repoRoot,
      scope: makeGitScope(["apps/demo-app/src/app/api/discount/apply/route.ts"]),
    });

    expect(result.impact.affected_capability_ids).toEqual(
      expect.arrayContaining(["api_apply_discount", "route_checkout"]),
    );
    expect(result.evidencePlan.selectedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "api_apply_discount",
          testFile: "tests/api/discount.test.ts",
        }),
      ]),
    );
    expect(result.decision).toEqual({
      decision: "WARN",
      reason:
        "trusted repo memory raised evidence requirement, but required browser evidence is missing.",
    });
    expect(result.evidencePlan.missingEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceType: "browser_smoke",
          target: "/checkout",
        }),
      ]),
    );
  });

  it("blocks real diff discount API changes when selected evidence fails", async () => {
    const fixture = await applyDemoDiscountRegressionFixture(repoRoot);
    try {
      const result = await runReleaseGuardWithScope({
        rootDir: repoRoot,
        scope: makeGitScope(["apps/demo-app/src/app/api/discount/apply/route.ts"]),
      });
      const report = await fs.readFile(result.reportPath, "utf8");

      expect(result.impact.affected_capability_ids).toEqual(
        expect.arrayContaining(["api_apply_discount", "route_checkout"]),
      );
      expect(result.evidencePlan.selectedEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            capabilityId: "api_apply_discount",
            testFile: "tests/api/discount.test.ts",
          }),
        ]),
      );
      expect(result.decision).toEqual({
        decision: "BLOCK",
        reason: "selected high-priority evidence failed.",
      });
      expect(report).toContain("Decision: BLOCK");
      expect(report).toContain("tests/api/discount.test.ts");
    } finally {
      await fixture.restore();
    }
  });

  it("warns when source changes cannot be mapped to a known capability", async () => {
    const result = await runReleaseGuardWithScope({
      rootDir: repoRoot,
      scope: makeGitScope(["apps/demo-app/src/lib/unknown-helper.ts"]),
    });
    const report = await fs.readFile(result.reportPath, "utf8");

    expect(result.decision).toEqual({
      decision: "WARN",
      reason: "source change could not be mapped to known capability.",
    });
    expect(result.impact.affected_capability_ids).toHaveLength(0);
    expect(result.executionResult.results).toHaveLength(0);
    expect(report).toContain("source change could not be mapped to known capability.");
  });
});

function makeGitScope(changedFiles: string[]): ChangeScope {
  const scope = analyzeScope(changedFiles);
  return {
    mode: "git",
    base: "base-ref",
    head: "head-ref",
    changedFiles,
    changedFileDetails: changedFiles.map((filePath) => ({
      path: filePath,
      status: "unknown",
    })),
    scope,
    docsOnly: scope.classification === "docs_only",
  };
}
