import { CapabilityEdge, CapabilityNode } from "../graph/types";
import { ScannerCoverage, UnresolvedCallsite } from "./types";

export type RepoContext = {
  rootDir: string;
  changedFiles?: string[];
};

export type SupportResult = {
  supported: boolean;
  partial?: boolean;
  reason: string;
};

export type CapabilityGraphFragment = {
  nodes: CapabilityNode[];
  edges: CapabilityEdge[];
  unresolved: UnresolvedCallsite[];
  coverage?: Partial<ScannerCoverage>;
};

export interface ScannerAdapter {
  name: string;
  supports(repo: RepoContext): Promise<SupportResult>;
  scan(repo: RepoContext): Promise<CapabilityGraphFragment>;
}
