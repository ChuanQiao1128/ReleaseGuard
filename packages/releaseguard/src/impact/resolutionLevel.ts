export const RESOLUTION_LEVELS = [
  "L0_CHANGED_FILE_ONLY",
  "L1_MODULE_MAPPED",
  "L2_CONTRACT_MAPPED",
  "L3_FRAMEWORK_CAPABILITY_MAPPED",
  "L4_TEST_EVIDENCE_MAPPED",
  "L5_DECLARED_CAPABILITY_MAPPED",
] as const;

export type ResolutionLevel = (typeof RESOLUTION_LEVELS)[number];

export type ResolutionLevelCounts = Record<ResolutionLevel, number>;

export function emptyResolutionLevelCounts(): ResolutionLevelCounts {
  return {
    L0_CHANGED_FILE_ONLY: 0,
    L1_MODULE_MAPPED: 0,
    L2_CONTRACT_MAPPED: 0,
    L3_FRAMEWORK_CAPABILITY_MAPPED: 0,
    L4_TEST_EVIDENCE_MAPPED: 0,
    L5_DECLARED_CAPABILITY_MAPPED: 0,
  };
}

export function maxResolutionLevel(
  first: ResolutionLevel,
  second: ResolutionLevel,
): ResolutionLevel {
  return levelRank(second) > levelRank(first) ? second : first;
}

function levelRank(level: ResolutionLevel): number {
  return RESOLUTION_LEVELS.indexOf(level);
}
