import { promises as fs } from "node:fs";
import path from "node:path";
import { DeterministicChangeImpactAgent } from "./agents/changeImpactAgent";
import { ChangeImpactAgentOutput } from "./agents/schemas";
import { validateChangeImpactOutput } from "./citations/citationValidator";
import { decide, DecisionResult } from "./decision/decisionEngine";
import { resolveChangeScope } from "./diff/diffParser";
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
};

export async function runReleaseGuard(
  options: RunReleaseGuardOptions,
): Promise<RunReleaseGuardResult> {
  const rootDir = options.rootDir;
  const runId = createRunId();
  const artifactDir = path.join(rootDir, "artifacts/releaseguard", runId);
  await fs.mkdir(artifactDir, { recursive: true });

  const scope = await resolveChangeScope({
    rootDir,
    base: options.base,
    head: options.head,
    fixture: options.fixture,
  });

  let preScanFixtureRestore: { restore(): Promise<void> } | undefined;
  try {
    if (scope.mode === "fixture" && scope.fixture === "demo-missing-evidence") {
      preScanFixtureRestore = await applyDemoMissingEvidenceFixture(rootDir);
    }

    const { graph, result: scannerResult } = await scanRepository(rootDir);
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

    const evidencePlan = planEvidence({
      graph,
      affectedCapabilityIds: impact.affected_capability_ids,
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

    const decision = decide({
      graph,
      evidencePlan,
      executionResult,
      docsOnly: scope.docsOnly,
      infrastructureFailed:
        !validation.valid ||
        (impact.affected_capability_ids.length === 0 && !scope.docsOnly),
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
    };
  } finally {
    await preScanFixtureRestore?.restore();
  }
}

function createRunId(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
}
