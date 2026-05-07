import { promises as fs } from "node:fs";
import path from "node:path";
import { DeterministicChangeImpactAgent } from "./agents/changeImpactAgent";
import { ChangeImpactAgentOutput } from "./agents/schemas";
import { validateChangeImpactOutput } from "./citations/citationValidator";
import { decide, DecisionResult } from "./decision/decisionEngine";
import { ChangeScope, resolveChangeScope } from "./diff/diffParser";
import { planEvidence } from "./evidence/evidencePlanner";
import { EvidencePlan } from "./evidence/types";
import {
  executeSelectedTests,
  EvidenceExecutionResult,
} from "./executor/selectedTestExecutor";
import {
  applyDemoDiscountRegressionFixture,
  applyDemoMissingEvidenceFixture,
} from "./fixtures/regressionFixture";
import { CapabilityGraph } from "./graph/types";
import { resolveImpact } from "./impact/impactResolver";
import {
  HistoricalRiskContext,
  resolveHistoricalRiskContexts,
} from "./memory/historicalRiskContext";
import { renderMarkdownReport } from "./report/markdownReport";
import { scanRepository } from "./scanner/repoScanner";

export type RunReleaseGuardOptions = {
  rootDir: string;
  base?: string;
  head?: string;
  fixture?: string;
};

export type RunReleaseGuardResult = {
  decision: DecisionResult;
  reportPath: string;
  artifactDir: string;
  graph: CapabilityGraph;
  impact: ChangeImpactAgentOutput;
  evidencePlan: EvidencePlan;
  executionResult: EvidenceExecutionResult;
  historicalRiskContexts: HistoricalRiskContext[];
};

export async function runReleaseGuard(
  options: RunReleaseGuardOptions,
): Promise<RunReleaseGuardResult> {
  const rootDir = options.rootDir;
  const scope = await resolveChangeScope({
    rootDir,
    base: options.base,
    head: options.head,
    fixture: options.fixture,
  });

  return runReleaseGuardWithScope({
    rootDir,
    scope,
  });
}

export async function runReleaseGuardWithScope(options: {
  rootDir: string;
  scope: ChangeScope;
}): Promise<RunReleaseGuardResult> {
  const rootDir = options.rootDir;
  const runId = createRunId();
  const artifactDir = path.join(rootDir, "artifacts/releaseguard", runId);
  await fs.mkdir(artifactDir, { recursive: true });
  const scope = options.scope;

  if (scope.docsOnly) {
    const graph = createEmptyRunGraph(rootDir);
    const impact = emptyImpact();
    const evidencePlan = emptyEvidencePlan();
    const executionResult = await writeEmptyExecutionResult(artifactDir);
    const historicalRiskContexts: HistoricalRiskContext[] = [];
    const decision = decide({
      graph,
      evidencePlan,
      executionResult,
      docsOnly: true,
    });
    const reportPath = path.join(artifactDir, "report.md");
    await fs.writeFile(
      reportPath,
      renderMarkdownReport({
        graph,
        scope,
        impact,
        evidencePlan,
        executionResult,
        decision,
        historicalRiskContexts,
        artifactDir,
      }),
    );

    return {
      decision,
      reportPath,
      artifactDir,
      graph,
      impact,
      evidencePlan,
      executionResult,
      historicalRiskContexts,
    };
  }

  let preScanFixtureRestore: { restore(): Promise<void> } | undefined;
  try {
    if (scope.mode === "fixture" && scope.fixture === "demo-missing-evidence") {
      preScanFixtureRestore = await applyDemoMissingEvidenceFixture(rootDir);
    }

    const { graph, result: scannerResult } = await scanRepository(rootDir);
    const impactResolution = resolveImpact({
      changedFiles: scope.changedFiles,
      graph,
    });
    const agent = new DeterministicChangeImpactAgent();
    const agentOutput = await agent.analyze({
      changedFiles: scope.changedFiles,
      graph,
    });
    const validation = validateChangeImpactOutput(graph, agentOutput);
    const impact: ChangeImpactAgentOutput = validation.valid
      ? validation.output
      : {
          affected_capability_ids: [],
          rationale_per_capability: {},
          citations: [],
          unresolved_items: validation.errors.map((error) => ({
            item: "change_impact_agent_output",
            reason: error,
          })),
        };

    const historicalRiskResolution = await resolveHistoricalRiskContexts({
      rootDir,
      graph,
      affectedCapabilityIds: impact.affected_capability_ids,
      modifiedFiles: scope.changedFiles,
    });
    const historicalRiskContexts = historicalRiskResolution.contexts;

    const evidencePlan = planEvidence({
      graph,
      affectedCapabilityIds: impact.affected_capability_ids,
      historicalRiskContexts,
    });

    let executionResult: EvidenceExecutionResult;
    let executionFixtureRestore: { restore(): Promise<void> } | undefined;
    try {
      if (scope.mode === "fixture" && scope.fixture === "demo-discount-regression") {
        executionFixtureRestore = await applyDemoDiscountRegressionFixture(rootDir);
      }
      executionResult = await executeSelectedTests({
        rootDir,
        artifactDir,
        selectedEvidence: evidencePlan.selectedEvidence,
      });
    } finally {
      await executionFixtureRestore?.restore();
    }

    const unmappedSourceChange =
      isUnmappedSourceChange(scope, impact) || impactResolution.failSafeWarn;
    const decision = decide({
      graph,
      evidencePlan,
      executionResult,
      docsOnly: scope.docsOnly,
      unmappedSourceChange,
      unresolvedImpactReason: impactResolution.failSafeWarn
        ? impactResolution.reason
        : undefined,
      infrastructureFailed:
        !validation.valid ||
        (!unmappedSourceChange &&
          impact.affected_capability_ids.length === 0 &&
          !scope.docsOnly),
    });

    const reportPath = path.join(artifactDir, "report.md");
    await fs.writeFile(
      reportPath,
      renderMarkdownReport({
        graph,
        scope,
        impact,
        evidencePlan,
        executionResult,
        decision,
        historicalRiskContexts,
        graphPath: scannerResult.graphPath,
        coveragePath: scannerResult.coveragePath,
        artifactDir,
      }),
    );

    return {
      decision,
      reportPath,
      artifactDir,
      graph,
      impact,
      evidencePlan,
      executionResult,
      historicalRiskContexts,
    };
  } finally {
    await preScanFixtureRestore?.restore();
  }
}

function isUnmappedSourceChange(
  scope: ChangeScope,
  impact: ChangeImpactAgentOutput,
): boolean {
  return (
    !scope.docsOnly &&
    scope.scope.classification === "source_or_test_change" &&
    impact.affected_capability_ids.length === 0 &&
    impact.unresolved_items.length > 0
  );
}

function createRunId(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(".", "");
}

function createEmptyRunGraph(rootDir: string): CapabilityGraph {
  return {
    version: "releaseguard-v0.1",
    rootDir,
    generatedAt: new Date().toISOString(),
    nodes: {},
    edges: {},
  };
}

function emptyImpact(): ChangeImpactAgentOutput {
  return {
    affected_capability_ids: [],
    rationale_per_capability: {},
    citations: [],
    unresolved_items: [],
  };
}

function emptyEvidencePlan(): EvidencePlan {
  return {
    requirements: [],
    selectedEvidence: [],
    missingEvidence: [],
  };
}

async function writeEmptyExecutionResult(
  artifactDir: string,
): Promise<EvidenceExecutionResult> {
  const artifactPath = path.join(artifactDir, "evidence_result.json");
  const testResultsPath = path.join(artifactDir, "test_results.json");
  const executionResult: EvidenceExecutionResult = {
    results: [],
    artifactPath,
    testResultsPath,
  };
  const payload = { results: [] };
  await fs.writeFile(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(testResultsPath, `${JSON.stringify(payload, null, 2)}\n`);
  return executionResult;
}
