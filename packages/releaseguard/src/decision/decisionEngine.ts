import { EvidenceExecutionResult } from "../executor/selectedTestExecutor";
import { EvidencePlan } from "../evidence/types";
import { getNodeRisk } from "../graph/capabilityGraph";
import { CapabilityGraph } from "../graph/types";

export type Decision = "PASS" | "WARN" | "BLOCK";

export type DecisionResult = {
  decision: Decision;
  reason: string;
};

export function decide(input: {
  graph: CapabilityGraph;
  evidencePlan: EvidencePlan;
  executionResult: EvidenceExecutionResult;
  affectedCapabilityIds?: string[];
  infrastructureFailed?: boolean;
  unmappedSourceChange?: boolean;
  unresolvedImpactReason?: string;
  docsOnly?: boolean;
}): DecisionResult {
  if (
    input.executionResult.results.some((result) => result.outcome === "failed")
  ) {
    return {
      decision: "BLOCK",
      reason: "selected high-priority evidence failed.",
    };
  }

  if (
    input.evidencePlan.missingEvidence.some(
      (missing) =>
        missing.evidenceType !== "browser_smoke" &&
        getNodeRisk(input.graph, missing.capabilityId) === "high",
    )
  ) {
    return {
      decision: "WARN",
      reason: "high-risk capability has missing required evidence.",
    };
  }

  if (
    input.evidencePlan.missingEvidence.some(
      (missing) => missing.evidenceType === "browser_smoke",
    )
  ) {
    return {
      decision: "WARN",
      reason:
        "trusted repo memory raised evidence requirement, but required browser evidence is missing.",
    };
  }

  if (input.unmappedSourceChange || input.unresolvedImpactReason) {
    return {
      decision: "WARN",
      reason:
        input.unresolvedImpactReason ??
        "source change could not be mapped to known capability.",
    };
  }

  if (
    input.infrastructureFailed ||
    input.executionResult.results.some(
      (result) => result.outcome === "inconclusive",
    )
  ) {
    return {
      decision: "WARN",
      reason: "ReleaseGuard infrastructure or selected test execution was inconclusive.",
    };
  }

  // Evidence floor: an affected route or api capability that has no
  // tested_by edge, no declared/selected evidence, and no file coverage
  // record cannot be verified by anything ReleaseGuard can see. Without
  // this rule, projects with zero tests get a misleading PASS on every
  // change to a known capability.
  if (!input.docsOnly && input.affectedCapabilityIds?.length) {
    const capsWithoutEvidence = capabilitiesWithoutAnyEvidence(
      input.graph,
      input.evidencePlan,
      input.affectedCapabilityIds,
    );
    if (capsWithoutEvidence.length > 0) {
      const noun =
        capsWithoutEvidence.length === 1
          ? "1 affected capability has"
          : `${capsWithoutEvidence.length} affected capabilities have`;
      return {
        decision: "WARN",
        reason: `${noun} no evidence (test, declared coverage, or file coverage); scanner cannot verify this change.`,
      };
    }
  }

  if (input.docsOnly) {
    return {
      decision: "PASS",
      reason: "low-risk docs-only change.",
    };
  }

  return {
    decision: "PASS",
    reason: "required selected evidence passed.",
  };
}

/**
 * Find affected capabilities that have no evidence of any kind:
 *   - no `tested_by` edges in the graph,
 *   - no `selectedEvidence` entry pointing at them,
 *   - no `coverageEvidence` entry pointing at them.
 *
 * Only returns route/api capabilities — file/module/package nodes are
 * not user-facing capabilities that need test evidence.
 */
function capabilitiesWithoutAnyEvidence(
  graph: CapabilityGraph,
  evidencePlan: EvidencePlan,
  affectedCapabilityIds: string[],
): string[] {
  const selectedCaps = new Set(
    evidencePlan.selectedEvidence.map((entry) => entry.capabilityId),
  );
  const coveredCaps = new Set(
    evidencePlan.coverageEvidence
      .map((entry) => entry.capability_id)
      .filter((id): id is string => Boolean(id)),
  );
  const testedSources = new Set<string>();
  for (const edge of Object.values(graph.edges)) {
    if (edge.type === "tested_by") {
      testedSources.add(edge.source);
    }
  }

  const without: string[] = [];
  for (const id of affectedCapabilityIds) {
    const node = graph.nodes[id];
    if (!node) continue;
    if (node.type !== "route" && node.type !== "api") continue;
    if (
      !testedSources.has(id) &&
      !selectedCaps.has(id) &&
      !coveredCaps.has(id)
    ) {
      without.push(id);
    }
  }
  return without;
}
