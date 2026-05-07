import path from "node:path";
import { EvidencePlan } from "../evidence/types";
import { CapabilityGraph } from "../graph/types";
import { HistoricalRiskContext } from "../memory/historicalRiskContext";
import { ReleaseGuardReportInput } from "./markdownReport";

export function renderHtmlReport(input: ReleaseGuardReportInput): string {
  const rel = (filePath: string) =>
    path.relative(input.graph.rootDir, filePath).split(path.sep).join("/");
  const decisionClass = input.decision.decision.toLowerCase();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ReleaseGuard Report - ${escapeHtml(input.decision.decision)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #17202a;
      --muted: #596675;
      --line: #d9dee5;
      --pass: #137333;
      --warn: #b06000;
      --block: #b3261e;
      --code: #eef2f6;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      max-width: 1040px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }
    h1 {
      margin: 0 0 16px;
      font-size: 28px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 18px;
    }
    .decision {
      border-left: 6px solid var(--muted);
      background: var(--panel);
      padding: 18px 20px;
      margin-bottom: 18px;
      box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
    }
    .decision.pass { border-left-color: var(--pass); }
    .decision.warn { border-left-color: var(--warn); }
    .decision.block { border-left-color: var(--block); }
    .decision strong {
      display: block;
      font-size: 22px;
      margin-bottom: 6px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 14px;
      margin-bottom: 14px;
    }
    section {
      background: var(--panel);
      border: 1px solid var(--line);
      padding: 16px;
      margin-bottom: 14px;
    }
    ul {
      margin: 0;
      padding-left: 20px;
    }
    li + li {
      margin-top: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 8px 6px;
      text-align: left;
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-weight: 600;
    }
    code {
      background: var(--code);
      padding: 2px 5px;
      border-radius: 4px;
    }
    .muted {
      color: var(--muted);
    }
  </style>
</head>
<body>
  <main>
    <h1>ReleaseGuard Report</h1>
    <section class="decision ${decisionClass}">
      <strong>Decision: ${escapeHtml(input.decision.decision)}</strong>
      <div>${escapeHtml(input.decision.reason)}</div>
    </section>
    <div class="grid">
      ${section("Changed files", changedFileHtml(input))}
      ${section("Affected capabilities", affectedCapabilitiesHtml(input.graph, input.impact.affected_capability_ids))}
    </div>
    ${section("Selected evidence", selectedEvidenceHtml(input.evidencePlan))}
    ${historicalRiskContextHtml(input.historicalRiskContexts ?? [])}
    ${section("Missing evidence", missingEvidenceHtml(input.evidencePlan))}
    ${section("Coverage evidence", coverageEvidenceHtml(input))}
    ${section("Test results", testResultsHtml(input))}
    ${section("Scanner coverage", scannerCoverageHtml(input, rel))}
    ${section("Artifacts", artifactsHtml(input, rel))}
  </main>
</body>
</html>
`;
}

function section(title: string, body: string): string {
  return `<section>
      <h2>${escapeHtml(title)}</h2>
      ${body}
    </section>`;
}

function changedFileHtml(input: ReleaseGuardReportInput): string {
  const prefix =
    input.scope.mode === "fixture"
      ? `Fixture: ${input.scope.fixture}`
      : `Diff: ${input.scope.base}..${input.scope.head}`;

  return [
    `<p class="muted">${escapeHtml(prefix)}</p>`,
    listHtml(input.scope.changedFiles.map((filePath) => code(filePath))),
  ].join("\n");
}

function affectedCapabilitiesHtml(
  graph: CapabilityGraph,
  capabilityIds: string[],
): string {
  if (capabilityIds.length === 0) {
    return emptyHtml();
  }

  return `<table>
      <thead><tr><th>ID</th><th>Target</th><th>Type</th><th>Risk</th></tr></thead>
      <tbody>
        ${capabilityIds
          .map((id) => {
            const node = graph.nodes[id];
            return `<tr><td>${code(id)}</td><td>${escapeHtml(node?.target ?? node?.name ?? "unknown")}</td><td>${escapeHtml(node?.type ?? "unknown")}</td><td>${escapeHtml(node?.risk ?? "unknown")}</td></tr>`;
          })
          .join("\n")}
      </tbody>
    </table>`;
}

function selectedEvidenceHtml(evidencePlan: EvidencePlan): string {
  if (evidencePlan.selectedEvidence.length === 0) {
    return emptyHtml();
  }

  return `<table>
      <thead><tr><th>Test</th><th>File</th><th>Capability</th><th>Tags</th></tr></thead>
      <tbody>
        ${evidencePlan.selectedEvidence
          .map(
            (evidence) =>
              `<tr><td>${code(evidence.testId)}</td><td>${code(evidence.testFile)}</td><td>${code(evidence.capabilityId)}</td><td>${escapeHtml(evidence.caseTags.join(", "))}</td></tr>`,
          )
          .join("\n")}
      </tbody>
    </table>`;
}

function historicalRiskContextHtml(contexts: HistoricalRiskContext[]): string {
  if (contexts.length === 0) {
    return "";
  }

  return section(
    "Historical risk context",
    listHtml(
      contexts.map(
        (context) =>
          `${code(context.context_id)}: ${escapeHtml(context.validation_status)} ${escapeHtml(context.evidence_implication)} for ${escapeHtml(context.affected_capability_ids.join(", "))} (${escapeHtml(context.source_chunk_ids.join(", "))}) - ${escapeHtml(context.summary)}`,
      ),
    ),
  );
}

function missingEvidenceHtml(evidencePlan: EvidencePlan): string {
  if (evidencePlan.missingEvidence.length === 0) {
    return emptyHtml();
  }

  return listHtml(
    evidencePlan.missingEvidence.map((missing) => {
      const tags =
        missing.requiredTags.length > 0
          ? missing.requiredTags.join(", ")
          : missing.evidenceType ?? "evidence";
      const target = missing.target ? ` target=${missing.target}` : "";
      const contexts = missing.sourceContextIds?.length
        ? ` source_context=${missing.sourceContextIds.join(",")}`
        : "";
      return `${code(missing.capabilityId)}: ${escapeHtml(missing.reason)} (${escapeHtml(tags + target + contexts)})`;
    }),
  );
}

function coverageEvidenceHtml(input: ReleaseGuardReportInput): string {
  if (!input.coverageReport) {
    return "<p>No coverage report provided.</p>";
  }
  if (input.evidencePlan.coverageEvidence.length === 0) {
    return `<p>Coverage report parsed (${escapeHtml(input.coverageReport.provider)}), but no changed or affected files matched coverage records.</p>
      <p class="muted">Limitation: coverage shows file execution by tests, not business-case assertions.</p>`;
  }

  return `<p>Provider: ${escapeHtml(input.coverageReport.provider)}</p>
    <table>
      <thead><tr><th>File</th><th>Capability</th><th>Line coverage</th><th>Strength</th></tr></thead>
      <tbody>
        ${input.evidencePlan.coverageEvidence
          .map(
            (evidence) =>
              `<tr><td>${code(evidence.file_path)}</td><td>${escapeHtml(evidence.capability_id ?? "unmapped")}</td><td>${evidence.line_coverage_percent.toFixed(2)}%</td><td>${escapeHtml(evidence.evidence_strength)}</td></tr>`,
          )
          .join("\n")}
      </tbody>
    </table>
    <p class="muted">Limitation: coverage shows this file was executed by tests, but does not prove the specific business case was asserted.</p>`;
}

function testResultsHtml(input: ReleaseGuardReportInput): string {
  if (input.executionResult.results.length === 0) {
    return emptyHtml();
  }

  return `<table>
      <thead><tr><th>Test file</th><th>Outcome</th><th>Exit code</th><th>Duration</th></tr></thead>
      <tbody>
        ${input.executionResult.results
          .map(
            (result) =>
              `<tr><td>${code(result.testFile)}</td><td>${escapeHtml(result.outcome.toUpperCase())}</td><td>${escapeHtml(String(result.exitCode ?? "null"))}</td><td>${result.durationMs}ms</td></tr>`,
          )
          .join("\n")}
      </tbody>
    </table>`;
}

function scannerCoverageHtml(
  input: ReleaseGuardReportInput,
  rel: (filePath: string) => string,
): string {
  if (!input.graphPath || !input.coveragePath) {
    return "<p>Skipped for low-risk docs-only change.</p>";
  }

  return listHtml([
    `Capability graph: ${code(rel(input.graphPath))}`,
    `Coverage report: ${code(rel(input.coveragePath))}`,
  ]);
}

function artifactsHtml(
  input: ReleaseGuardReportInput,
  rel: (filePath: string) => string,
): string {
  return listHtml([
    `Markdown report: ${code(`${rel(input.artifactDir)}/report.md`)}`,
    `HTML report: ${code(`${rel(input.artifactDir)}/report.html`)}`,
    `Evidence result: ${code(rel(input.executionResult.artifactPath))}`,
    `Test results: ${code(rel(input.executionResult.testResultsPath))}`,
  ]);
}

function listHtml(items: string[]): string {
  if (items.length === 0) {
    return emptyHtml();
  }
  return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

function emptyHtml(): string {
  return "<p>None</p>";
}

function code(value: string): string {
  return `<code>${escapeHtml(value)}</code>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
