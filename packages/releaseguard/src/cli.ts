#!/usr/bin/env node
import path from "node:path";
import { existsSync } from "node:fs";
import { runReleaseGuard } from "./run";
import { Decision } from "./decision/decisionEngine";

export type CliArgs =
  | {
      command: "run";
      base?: string;
      head?: string;
      fixture?: string;
      expectDecision?: Decision;
    }
  | { command: "help" };

const VALID_DECISIONS = new Set<Decision>(["PASS", "WARN", "BLOCK"]);

export function parseCliArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    return { command: "help" };
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
  const result = await runReleaseGuard({
    rootDir,
    base: args.base,
    head: args.head,
    fixture: args.fixture,
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
    "  releaseguard run --fixture demo-docs-only --expect-decision PASS",
  ].join("\n");
}

if (require.main === module) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
