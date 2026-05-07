import { CapabilityGraph, TestCaseTag } from "../graph/types";
import { HistoricalRiskContext } from "../memory/historicalRiskContext";
import { EvidencePlan, EvidenceRequirement, MissingEvidence } from "./types";
import { selectExistingTests } from "./existingTestSelector";

const INVALID_DISCOUNT_TAGS: TestCaseTag[] = [
  "invalid_discount",
  "400",
  "error_status",
];

export function planEvidence(input: {
  graph: CapabilityGraph;
  affectedCapabilityIds: string[];
  historicalRiskContexts?: HistoricalRiskContext[];
}): EvidencePlan {
  const requirements: EvidenceRequirement[] = [];
  const missingEvidence: MissingEvidence[] = [];
  const selectedEvidence = [];

  for (const capabilityId of input.affectedCapabilityIds) {
    if (capabilityId !== "api_apply_discount") {
      continue;
    }

    const requirement: EvidenceRequirement = {
      id: "req_api_apply_discount_invalid_discount",
      type: "existing_test",
      capabilityId,
      requiredTags: INVALID_DISCOUNT_TAGS,
      description:
        "Invalid discount requests must return HTTP 400 with an error response.",
    };
    requirements.push(requirement);
    const selected = selectExistingTests({
      graph: input.graph,
      capabilityId,
      requirementId: requirement.id,
      requiredTags: requirement.requiredTags,
    });
    selectedEvidence.push(...selected);

    if (selected.length === 0) {
      missingEvidence.push({
        requirementId: requirement.id,
        capabilityId,
        reason:
          "No direct API test had invalid_discount, 400, and error_status tags.",
        requiredTags: requirement.requiredTags,
      });
    }
  }

  for (const context of input.historicalRiskContexts ?? []) {
    if (
      context.validation_status !== "accepted" ||
      context.evidence_implication !== "require_browser_smoke"
    ) {
      continue;
    }
    const capabilityId = input.affectedCapabilityIds.includes("route_checkout")
      ? "route_checkout"
      : context.affected_capability_ids[0];
    const requirement: EvidenceRequirement = {
      id: `req_${context.context_id}_checkout_browser_smoke`,
      type: "browser_smoke",
      capabilityId,
      requiredTags: [],
      description:
        "Checkout browser smoke evidence is required because trusted repo memory links checkout critical-flow policy to historical discount failures.",
      target: "/checkout",
      priority: "high",
      sourceContextIds: [context.context_id],
    };
    requirements.push(requirement);
    missingEvidence.push({
      requirementId: requirement.id,
      capabilityId,
      reason:
        "trusted repo memory raised evidence requirement, but required browser evidence is missing.",
      requiredTags: [],
      evidenceType: "browser_smoke",
      target: "/checkout",
      priority: "high",
      sourceContextIds: [context.context_id],
    });
  }

  return {
    requirements,
    selectedEvidence,
    missingEvidence,
  };
}
