import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runReleaseGuard } from "../src/run";

const repoRoot = path.resolve(process.cwd(), "../..");
const testPath = path.join(repoRoot, "apps/demo-app/tests/api/discount.test.ts");

describe("demo-missing-evidence fixture", () => {
  it("returns WARN through the missing evidence path and restores the test file", async () => {
    const before = await fs.readFile(testPath, "utf8");

    const result = await runReleaseGuard({
      rootDir: repoRoot,
      fixture: "demo-missing-evidence",
    });

    const after = await fs.readFile(testPath, "utf8");
    const report = await fs.readFile(result.reportPath, "utf8");

    expect(result.decision).toEqual({
      decision: "WARN",
      reason: "high-risk capability has missing required evidence.",
    });
    expect(result.impact.affected_capability_ids).toEqual(
      expect.arrayContaining(["api_apply_discount", "route_checkout"]),
    );
    expect(result.evidencePlan.selectedEvidence).toHaveLength(0);
    expect(result.executionResult.results).toHaveLength(0);
    expect(result.evidencePlan.missingEvidence).toContainEqual(
      expect.objectContaining({
        capabilityId: "api_apply_discount",
        requiredTags: expect.arrayContaining([
          "invalid_discount",
          "400",
          "error_status",
        ]),
      }),
    );
    expect(report).toContain("Decision: WARN");
    expect(report).toContain("api_apply_discount");
    expect(report).toContain("route_checkout");
    expect(report).toContain("No direct API test had invalid_discount");
    expect(report).toContain("high-risk capability has missing required evidence");
    expect(after).toBe(before);
  }, 20_000);
});

