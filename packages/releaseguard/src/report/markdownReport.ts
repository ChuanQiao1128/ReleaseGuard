import path from "node:path";
import { ChangeImpactAgentOutput } from "../agents/schemas";
import { DecisionResult } from "../decision/decisionEngine";
import { ChangeScope } from "../diff/diffParser";
import { EvidencePlan } from "../evidence/types";
import { EvidenceExecutionResult } from "../executor/selectedTestExecutor";
import { CapabilityGraph } from "../graph/types";
import { HistoricalRiskContext } from "../memory/historicalRiskContext";

export function renderMarkdownReport(input: {
  graph: CapabilityGraph;
  scope: ChangeScope;
  impact: ChangeImpactAgentOutput;
  evidencePlan: EvidencePlan;
  executionResult: EvidenceExecutionResult;
  decision: DecisionResult;
  historicalRiskContexts?: HistoricalRiskContext[];
  graphPath?: string;
  coveragePath?: string;
  artifactDir: string;
}): string {
  const rel = (filePath: string) =>
    path.relative(input.graph.rootDir, filePath).split(path.sep).join("/");

  return [
    "# ReleaseGuard Report",
    "",
    `Decision: ${input.decision.decision}`,
    "",
    "## Changed files",
    ...changedFileLines(input.scope),
    "",
    "## Affected capabilities",
    ...listOrNone(
      input.impact.affected_capability_ids.map((id) => {
        const node = input.graph.nodes[id];
        return `- ${id}: ${node?.target ?? node?.name ?? "unknown"} (${node?.type ?? "unknown"})`;
      }),
    ),
    "",
    "## Selected evidence",
    ...listOrNone(
      input.evidencePlan.selectedEvidence.map(
        (evidence) =>
          `- ${evidence.testId}: ${evidence.testFile} for ${evidence.capabilityId} (${evidence.caseTags.join(", ")})`,
      ),
    ),
    ...historicalRiskContextSection(input.historicalRiskContexts ?? []),
    "",
    "## Missing evidence",
    ...listOrNone(
      input.evidencePlan.missingEvidence.map(
        (missing) => {
          const tags = missing.requiredTags.length > 0
            ? missing.requiredTags.join(", ")
            : missing.evidenceType ?? "evidence";
          const target = missing.target ? ` target=${missing.target}` : "";
          const contexts = missing.sourceContextIds?.length
            ? ` source_context=${missing.sourceContextIds.join(",")}`
            : "";
          return `- ${missing.capabilityId}: ${missing.reason} (${tags}${target}${contexts})`;
        },
      ),
    ),
    "",
    "## Test results",
    ...listOrNone(
      input.executionResult.results.map(
        (result) =>
          `- ${result.testFile}: ${result.outcome.toUpperCase()} (exit ${result.exitCode ?? "null"}, ${result.durationMs}ms)`,
      ),
    ),
    "",
    "## Decision rationale",
    `- ${input.decision.reason}`,
    "",
    "## Scanner coverage",
    ...scannerCoverageLines(input.graphPath, input.coveragePath, rel),
    "",
    "## Artifacts",
    `- Report directory: ${rel(input.artifactDir)}`,
    `- Evidence result: ${rel(input.executionResult.artifactPath)}`,
    `- Test results: ${rel(input.executionResult.testResultsPath)}`,
    "",
  ].join("\n");
}

function changedFileLines(scope: ChangeScope): string[] {
  const prefix =
    scope.mode === "fixture" ? `Fixture: ${scope.fixture}` : `Diff: ${scope.base}..${scope.head}`;
  return [prefix, ...scope.changedFiles.map((filePath) => `- ${filePath}`)];
}

function listOrNone(items: string[]): string[] {
  return items.length > 0 ? items : ["- None"];
}

function historicalRiskContextSection(
  contexts: HistoricalRiskContext[],
): string[] {
  if (contexts.length === 0) {
    return [];
  }
  return [
    "",
    "## Historical risk context",
    ...contexts.map(
      (context) =>
        `- ${context.context_id}: ${context.validation_status} ${context.evidence_implication} for ${context.affected_capability_ids.join(", ")} (${context.source_chunk_ids.join(", ")}) - ${context.summary}`,
    ),
  ];
}

function scannerCoverageLines(
  graphPath: string | undefined,
  coveragePath: string | undefined,
  rel: (filePath: string) => string,
): string[] {
  if (!graphPath || !coveragePath) {
    return ["- Skipped for low-risk docs-only change."];
  }

  return [
    `- Capability graph: ${rel(graphPath)}`,
    `- Coverage report: ${rel(coveragePath)}`,
  ];
}
