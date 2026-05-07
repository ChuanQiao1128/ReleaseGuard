#!/usr/bin/env node
import path from "node:path";
import { existsSync } from "node:fs";
import { runReleaseGuard } from "./run";
import { Decision } from "./decision/decisionEngine";
import { CoverageProvider } from "./coverage/types";
import { writeCoverageReport } from "./coverage/coverageIngest";
import { writeRepoMemoryIndex } from "./memory/memoryIndex";
import { runRagBenchmark } from "./memory/benchmark";
import { writeRagDemoDiscountContext } from "./memory/demoDiscountContext";
import { guardedRetrieveWithRrf } from "./memory/guardedRetriever";
import { runScannerEval } from "./scanner/scannerEval";

export type CliArgs =
  | {
      command: "run";
      base?: string;
      head?: string;
      fixture?: string;
      expectDecision?: Decision;
      coverageFile?: string;
    }
  | {
      command: "coverage";
      action: "ingest";
      file: string;
      provider?: CoverageProvider;
    }
  | {
      command: "memory";
      action: "index" | "benchmark" | "demo-discount-context" | "search";
      query?: string;
    }
  | {
      command: "scanner";
      action: "eval";
      root: string;
      coverageFile?: string;
    }
  | { command: "help" };

const VALID_DECISIONS = new Set<Decision>(["PASS", "WARN", "BLOCK"]);

export function parseCliArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    return { command: "help" };
  }
  if (command === "memory") {
    const [action, ...extra] = rest;
    if (
      action !== "index" &&
      action !== "benchmark" &&
      action !== "demo-discount-context" &&
      action !== "search"
    ) {
      throw new Error(
        "memory requires one of: index, benchmark, demo-discount-context, search.",
      );
    }
    let query: string | undefined;
    for (let index = 0; index < extra.length; index += 1) {
      const arg = extra[index];
      if (arg === "--query") {
        query = requireValue(extra, index, "--query");
        index += 1;
      } else {
        throw new Error(`Unknown argument: ${arg}`);
      }
    }
    if (action === "search" && !query) {
      throw new Error("memory search requires --query.");
    }
    if (action !== "search" && query) {
      throw new Error("--query is only supported with memory search.");
    }
    return {
      command: "memory",
      action,
      query,
    };
  }
  if (command === "coverage") {
    const [action, ...extra] = rest;
    if (action !== "ingest") {
      throw new Error("coverage requires action: ingest.");
    }
    let file: string | undefined;
    let provider: CoverageProvider | undefined;
    for (let index = 0; index < extra.length; index += 1) {
      const arg = extra[index];
      if (arg === "--file") {
        file = requireValue(extra, index, "--file");
        index += 1;
      } else if (arg === "--provider") {
        provider = parseCoverageProvider(requireValue(extra, index, "--provider"));
        index += 1;
      } else {
        throw new Error(`Unknown argument: ${arg}`);
      }
    }
    if (!file) {
      throw new Error("coverage ingest requires --file.");
    }
    return {
      command: "coverage",
      action,
      file,
      provider,
    };
  }
  if (command === "scanner") {
    const [action, ...extra] = rest;
    if (action !== "eval") {
      throw new Error("scanner requires action: eval.");
    }
    let root: string | undefined;
    let coverageFile: string | undefined;
    for (let index = 0; index < extra.length; index += 1) {
      const arg = extra[index];
      if (arg === "--root") {
        root = requireValue(extra, index, "--root");
        index += 1;
      } else if (arg === "--coverage") {
        coverageFile = requireValue(extra, index, "--coverage");
        index += 1;
      } else {
        throw new Error(`Unknown argument: ${arg}`);
      }
    }
    if (!root) {
      throw new Error("scanner eval requires --root.");
    }
    return { command: "scanner", action, root, coverageFile };
  }

  if (command !== "run") {
    throw new Error(`Unknown command: ${command}`);
  }

  const parsed: Extract<CliArgs, { command: "run" }> = { command: "run" };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--base") {
      parsed.base = requireValue(rest, index, "--base");
      index += 1;
    } else if (arg === "--head") {
      parsed.head = requireValue(rest, index, "--head");
      index += 1;
    } else if (arg === "--fixture") {
      parsed.fixture = requireValue(rest, index, "--fixture");
      index += 1;
    } else if (arg === "--expect-decision") {
      parsed.expectDecision = parseExpectedDecision(
        requireValue(rest, index, "--expect-decision"),
      );
      index += 1;
    } else if (arg === "--coverage") {
      parsed.coverageFile = requireValue(rest, index, "--coverage");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!parsed.fixture && (!parsed.base || !parsed.head)) {
    throw new Error("run requires --base/--head or --fixture.");
  }
  return parsed;
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCliArgs(argv);
  if (args.command === "help") {
    console.log(usage());
    return;
  }

  const rootDir = resolveRootDir();
  if (args.command === "coverage") {
    const { report, outputPath } = await writeCoverageReport({
      repoRoot: rootDir,
      coverageFile: args.file,
      provider: args.provider,
    });
    console.log(`Coverage provider: ${report.provider}`);
    console.log(`Coverage files: ${report.file_count}`);
    console.log(`Covered files: ${report.covered_file_count}`);
    console.log(`Output: ${relativePath(rootDir, outputPath)}`);
    return;
  }
  if (args.command === "scanner") {
    const result = await runScannerEval({
      workspaceRoot: rootDir,
      repoRoot: resolveUserPath(args.root),
      coverageFile: args.coverageFile,
    });
    console.log(`Scanner eval repo: ${result.repo_path}`);
    console.log(`Framework detected: ${result.framework_detected}`);
    console.log(`Supported: ${result.supported ? "yes" : "no"}`);
    console.log(`Routes detected: ${result.routes_detected}`);
    console.log(`APIs detected: ${result.apis_detected}`);
    console.log(`Resolved callsites: ${result.resolved_callsites}`);
    console.log(`Unresolved callsites: ${result.unresolved_callsites}`);
    console.log(`Unresolved rate: ${(result.unresolved_rate * 100).toFixed(1)}%`);
    if (args.coverageFile) {
      console.log(`Coverage files: ${result.coverage_file_count}`);
      console.log(`Coverage matched files: ${result.coverage_matched_file_count}`);
    }
    console.log(`Report: ${relativePath(rootDir, result.report_path)}`);
    return;
  }
  if (args.command === "memory") {
    if (args.action === "index") {
      const result = await writeRepoMemoryIndex(rootDir);
      const outputPath = path
        .relative(rootDir, result.outputPath)
        .split(path.sep)
        .join("/");
      console.log(`Memory chunks: ${result.chunks.length}`);
      console.log(`Output: ${outputPath}`);
      return;
    }
    if (args.action === "benchmark") {
      const result = await runRagBenchmark(rootDir);
      console.log(`Memory benchmark chunks: ${result.index_chunk_count}`);
      console.log(`Memory benchmark items: ${result.dataset_item_count}`);
      for (const benchmark of result.results) {
        console.log(
          `${benchmark.retriever}: Recall@5=${benchmark.metrics.recall_at_5.toFixed(3)} MRR=${benchmark.metrics.mrr.toFixed(3)} no-answer-FPR=${benchmark.metrics.no_answer_false_positive_rate.toFixed(3)} no-answer-abstention=${benchmark.metrics.no_answer_abstention_rate.toFixed(3)}`,
        );
      }
      console.log(`Report: ${relativePath(rootDir, result.markdown_report_path)}`);
      return;
    }
    if (args.action === "demo-discount-context") {
      const result = await writeRagDemoDiscountContext(rootDir);
      console.log(`Retrieved chunks: ${result.retrievedChunkIds.length}`);
      console.log(`Report: ${relativePath(rootDir, result.reportPath)}`);
      return;
    }
    const index = await writeRepoMemoryIndex(rootDir);
    const result = await guardedRetrieveWithRrf({
      chunks: index.chunks,
      query: args.query ?? "",
      limit: 5,
    });
    const chunksById = new Map(index.chunks.map((chunk) => [chunk.chunk_id, chunk]));
    console.log(`Decision: ${result.decision}`);
    console.log(`Reason: ${result.reason}`);
    console.log(`Retrieved chunks: ${result.results.length}`);
    for (const item of result.results) {
      const chunk = chunksById.get(item.chunk_id);
      console.log(
        `- ${item.rank}. ${chunk?.title ?? item.chunk_id} (${chunk?.file_path ?? "unknown"})`,
      );
    }
    return;
  }

  const result = await runReleaseGuard({
    rootDir,
    base: args.base,
    head: args.head,
    fixture: args.fixture,
    coverageFile: args.coverageFile,
  });
  const report = path
    .relative(rootDir, result.reportPath)
    .split(path.sep)
    .join("/");

  console.log(`Decision: ${result.decision.decision}`);
  console.log(`Reason: ${result.decision.reason}`);
  console.log(`Report: ${report}`);

  assertExpectedDecision(result.decision.decision, args.expectDecision);
}

function relativePath(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

function resolveRootDir(): string {
  let current = process.env.INIT_CWD ?? process.cwd();
  while (true) {
    if (
      existsSync(path.join(current, "apps/demo-app")) &&
      existsSync(path.join(current, "package.json"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return process.cwd();
    }
    current = parent;
  }
}

function resolveUserPath(userPath: string): string {
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), userPath);
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function parseExpectedDecision(value: string): Decision {
  if (!VALID_DECISIONS.has(value as Decision)) {
    throw new Error(
      `--expect-decision must be one of PASS, WARN, or BLOCK. Received: ${value}`,
    );
  }
  return value as Decision;
}

function parseCoverageProvider(value: string): CoverageProvider {
  if (value !== "lcov" && value !== "cobertura") {
    throw new Error("--provider must be one of lcov or cobertura.");
  }
  return value;
}

export function assertExpectedDecision(
  actual: Decision,
  expected: Decision | undefined,
): void {
  if (!expected) {
    return;
  }
  if (actual !== expected) {
    throw new Error(`Expected decision ${expected}, received ${actual}.`);
  }
  console.log(`Expected decision matched: ${expected}`);
}

function usage(): string {
  return [
    "Usage:",
    "  releaseguard run --base <base> --head <head>",
    "  releaseguard run --fixture demo-discount-regression",
    "  releaseguard run --fixture demo-missing-evidence",
    "  releaseguard run --fixture demo-docs-only",
    "  releaseguard run --fixture demo-rag-elevated-evidence",
    "  releaseguard run --fixture demo-coverage-supplemental-evidence --coverage <coverage_file>",
    "  releaseguard run --fixture demo-docs-only --expect-decision PASS",
    "  releaseguard memory index",
    "  releaseguard memory benchmark",
    "  releaseguard memory demo-discount-context",
    '  releaseguard memory search --query "discount checkout crash"',
    "  releaseguard coverage ingest --file <coverage_file>",
    "  releaseguard scanner eval --root <repo_path>",
    "  releaseguard scanner eval --root <repo_path> --coverage <coverage_file>",
  ].join("\n");
}

if (require.main === module) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
