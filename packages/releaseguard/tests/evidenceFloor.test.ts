import { describe, expect, it } from "vitest";
import { decide } from "../src/decision/decisionEngine";
import { CapabilityGraph } from "../src/graph/types";

/**
 * Evidence floor tests: when an affected capability has no evidence of
 * any kind (no tests, no coverage, no declared evidence), ReleaseGuard
 * must not silently PASS. It must WARN with an explicit rationale.
 *
 * This rule exists because: a project with zero tests was previously
 * getting `Decision: PASS` on every change to a known capability, since
 * the evidence planner produced 0 requirements (nothing to fail). That
 * gave reviewers misleading confidence.
 */

function buildGraph(opts: {
  apiId: string;
  withTestEdge?: boolean;
}): CapabilityGraph {
  const graph: CapabilityGraph = {
    version: "test",
    rootDir: "/tmp",
    generatedAt: new Date().toISOString(),
    nodes: {
      [opts.apiId]: {
        id: opts.apiId,
        type: "api",
        name: "POST /api/foo",
        target: "POST /api/foo",
        risk: "medium",
        confidence: "high",
        confidenceBasis: "test",
        evidenceRefs: [],
        metadata: {},
      },
    },
    edges: {},
  };
  if (opts.withTestEdge) {
    const testId = "test_foo";
    graph.nodes[testId] = {
      id: testId,
      type: "test",
      name: testId,
      confidence: "high",
      confidenceBasis: "test",
      evidenceRefs: [],
      metadata: {},
    };
    graph.edges["edge_foo_tested"] = {
      id: "edge_foo_tested",
      type: "tested_by",
      source: opts.apiId,
      target: testId,
      confidence: "high",
      confidenceBasis: "test",
      evidenceRefs: [],
      metadata: {},
    };
  }
  return graph;
}

describe("decision engine evidence floor", () => {
  it("WARNs when an affected capability has no test, coverage, or declared evidence", () => {
    const result = decide({
      graph: buildGraph({ apiId: "api_foo" }),
      evidencePlan: {
        requirements: [],
        selectedEvidence: [],
        missingEvidence: [],
        coverageEvidence: [],
      },
      executionResult: { results: [] },
      affectedCapabilityIds: ["api_foo"],
    });

    expect(result.decision).toBe("WARN");
    expect(result.reason).toMatch(/no evidence/i);
    expect(result.reason).toMatch(/scanner cannot verify/i);
  });

  it("uses singular phrasing for one capability without evidence", () => {
    const result = decide({
      graph: buildGraph({ apiId: "api_foo" }),
      evidencePlan: {
        requirements: [],
        selectedEvidence: [],
        missingEvidence: [],
        coverageEvidence: [],
      },
      executionResult: { results: [] },
      affectedCapabilityIds: ["api_foo"],
    });

    expect(result.reason).toMatch(/^1 affected capability has/);
  });

  it("uses plural phrasing for multiple capabilities without evidence", () => {
    const graph: CapabilityGraph = {
      version: "test",
      rootDir: "/tmp",
      generatedAt: new Date().toISOString(),
      nodes: {
        api_a: {
          id: "api_a", type: "api", name: "a", risk: "medium",
          confidence: "high", confidenceBasis: "t",
          evidenceRefs: [], metadata: {},
        },
        api_b: {
          id: "api_b", type: "api", name: "b", risk: "medium",
          confidence: "high", confidenceBasis: "t",
          evidenceRefs: [], metadata: {},
        },
      },
      edges: {},
    };
    const result = decide({
      graph,
      evidencePlan: {
        requirements: [],
        selectedEvidence: [],
        missingEvidence: [],
        coverageEvidence: [],
      },
      executionResult: { results: [] },
      affectedCapabilityIds: ["api_a", "api_b"],
    });

    expect(result.decision).toBe("WARN");
    expect(result.reason).toMatch(/^2 affected capabilities have/);
  });

  it("does not WARN when the capability has a tested_by edge", () => {
    const result = decide({
      graph: buildGraph({ apiId: "api_foo", withTestEdge: true }),
      evidencePlan: {
        requirements: [],
        selectedEvidence: [],
        missingEvidence: [],
        coverageEvidence: [],
      },
      executionResult: { results: [] },
      affectedCapabilityIds: ["api_foo"],
    });

    expect(result.decision).toBe("PASS");
  });

  it("does not WARN when there is selected evidence for the capability", () => {
    const result = decide({
      graph: buildGraph({ apiId: "api_foo" }),
      evidencePlan: {
        requirements: [],
        selectedEvidence: [
          {
            requirementId: "req_1",
            capabilityId: "api_foo",
            testId: "test_foo",
            testFile: "tests/foo.test.ts",
            coverageDepth: "direct",
            caseTags: [],
          },
        ],
        missingEvidence: [],
        coverageEvidence: [],
      },
      executionResult: {
        results: [
          {
            requirementId: "req_1",
            testId: "test_foo",
            outcome: "passed",
            durationMs: 100,
          } as never,
        ],
      },
      affectedCapabilityIds: ["api_foo"],
    });

    expect(result.decision).toBe("PASS");
  });

  it("does not WARN when there is file coverage for the capability", () => {
    const result = decide({
      graph: buildGraph({ apiId: "api_foo" }),
      evidencePlan: {
        requirements: [],
        selectedEvidence: [],
        missingEvidence: [],
        coverageEvidence: [
          {
            capability_id: "api_foo",
            file_path: "src/api/foo.ts",
            coverage_record_id: "rec_1",
            evidence_type: "coverage_file_evidence",
            evidence_strength: "supplemental",
            line_coverage_percent: 85,
            summary: "ok",
            limitations: [],
          },
        ],
      },
      executionResult: { results: [] },
      affectedCapabilityIds: ["api_foo"],
    });

    expect(result.decision).toBe("PASS");
  });

  it("docs-only changes still PASS even when affectedCapabilityIds is empty", () => {
    const result = decide({
      graph: buildGraph({ apiId: "api_foo" }),
      evidencePlan: {
        requirements: [],
        selectedEvidence: [],
        missingEvidence: [],
        coverageEvidence: [],
      },
      executionResult: { results: [] },
      docsOnly: true,
    });

    expect(result.decision).toBe("PASS");
    expect(result.reason).toMatch(/docs-only/);
  });

  it("unmapped source change WARN takes precedence over evidence floor", () => {
    const result = decide({
      graph: buildGraph({ apiId: "api_foo" }),
      evidencePlan: {
        requirements: [],
        selectedEvidence: [],
        missingEvidence: [],
        coverageEvidence: [],
      },
      executionResult: { results: [] },
      affectedCapabilityIds: ["api_foo"],
      unmappedSourceChange: true,
    });

    expect(result.decision).toBe("WARN");
    // Should be the unmapped reason, not the evidence-floor reason
    expect(result.reason).toMatch(/could not be mapped/);
  });

  it("ignores file/module/package nodes for evidence floor (only routes/apis count)", () => {
    const graph: CapabilityGraph = {
      version: "test",
      rootDir: "/tmp",
      generatedAt: new Date().toISOString(),
      nodes: {
        file_x: {
          id: "file_x", type: "file", name: "x",
          filePath: "src/x.ts",
          confidence: "high", confidenceBasis: "t",
          evidenceRefs: [], metadata: {},
        },
      },
      edges: {},
    };
    const result = decide({
      graph,
      evidencePlan: {
        requirements: [],
        selectedEvidence: [],
        missingEvidence: [],
        coverageEvidence: [],
      },
      executionResult: { results: [] },
      affectedCapabilityIds: ["file_x"],
    });

    expect(result.decision).toBe("PASS");
  });
});
