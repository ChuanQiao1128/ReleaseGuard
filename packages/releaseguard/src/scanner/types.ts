import { ConfidenceLevel } from "../graph/types";
import { ResolutionLevel, ResolutionLevelCounts } from "../impact/resolutionLevel";
import { UnresolvedPatternCategory } from "./unresolvedPatternClassifier";

export type FileRole =
  | "docs"
  | "source"
  | "test"
  | "config"
  | "dependency"
  | "generated"
  | "unknown";

export type ResolvedCallsite = {
  filePath: string;
  line: number;
  routeId: string;
  apiId: string;
  method: string;
  path: string;
  confidence: ConfidenceLevel;
  confidenceBasis: string;
};

export type UnresolvedCallsite = {
  filePath: string;
  line: number;
  reason: string;
  quote: string;
  confidence: "unresolved";
  pattern?: UnresolvedPatternCategory;
};

export type ScannerCoverage = {
  scannedFiles: string[];
  fileRoleCounts?: Partial<Record<FileRole, number>>;
  detectedRoutes: Array<{ id: string; target: string; filePath: string }>;
  detectedApis: Array<{ id: string; target: string; filePath: string }>;
  resolvedCallsites: ResolvedCallsite[];
  unresolvedCallsites: UnresolvedCallsite[];
  confidenceBreakdown: Record<ConfidenceLevel, number>;
  resolutionLevelCounts?: Partial<ResolutionLevelCounts>;
  limitations: string[];
};

export type ScannerResult = {
  graphPath: string;
  coveragePath: string;
  coverage: ScannerCoverage;
};
