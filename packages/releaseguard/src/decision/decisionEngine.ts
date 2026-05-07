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
  infrastructureFailed?: boolean;
  unmappedSourceChange?: boolean;
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

  if (input.unmappedSourceChange) {
    return {
      decision: "WARN",
      reason: "source change could not be mapped to known capability.",
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
