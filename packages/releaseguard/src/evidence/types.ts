import { TestCaseTag } from "../graph/types";

export type EvidenceRequirementType =
  | "existing_test"
  | "missing_evidence"
  | "browser_smoke";
export type CoverageDepth = "direct" | "transitive";
export type EvidencePriority = "low" | "medium" | "high";

export type EvidenceRequirement = {
  id: string;
  type: EvidenceRequirementType;
  capabilityId: string;
  requiredTags: TestCaseTag[];
  description: string;
  target?: string;
  priority?: EvidencePriority;
  sourceContextIds?: string[];
};

export type SelectedEvidence = {
  requirementId: string;
  capabilityId: string;
  testId: string;
  testFile: string;
  coverageDepth: CoverageDepth;
  caseTags: TestCaseTag[];
};

export type MissingEvidence = {
  requirementId: string;
  capabilityId: string;
  reason: string;
  requiredTags: TestCaseTag[];
  evidenceType?: EvidenceRequirementType;
  target?: string;
  priority?: EvidencePriority;
  sourceContextIds?: string[];
};

export type EvidencePlan = {
  requirements: EvidenceRequirement[];
  selectedEvidence: SelectedEvidence[];
  missingEvidence: MissingEvidence[];
};
