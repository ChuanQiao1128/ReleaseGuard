import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ChangeScope =
  | {
      mode: "fixture";
      fixture: "demo-discount-regression" | "demo-missing-evidence";
      changedFiles: string[];
      docsOnly: false;
    }
  | {
      mode: "git";
      base: string;
      head: string;
      changedFiles: string[];
      docsOnly: boolean;
    };

export async function resolveChangeScope(args: {
  rootDir: string;
  base?: string;
  head?: string;
  fixture?: string;
}): Promise<ChangeScope> {
  if (args.fixture) {
    if (
      args.fixture !== "demo-discount-regression" &&
      args.fixture !== "demo-missing-evidence"
    ) {
      throw new Error(`Unknown fixture: ${args.fixture}`);
    }
    return {
      mode: "fixture",
      fixture: args.fixture,
      changedFiles: ["apps/demo-app/src/app/api/discount/apply/route.ts"],
      docsOnly: false,
    };
  }

  if (!args.base || !args.head) {
    throw new Error("releaseguard run requires --base/--head or --fixture.");
  }

  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-only", `${args.base}..${args.head}`],
    { cwd: args.rootDir },
  );
  const changedFiles = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    mode: "git",
    base: args.base,
    head: args.head,
    changedFiles,
    docsOnly: changedFiles.length > 0 && changedFiles.every(isDocsOnlyPath),
  };
}

export function isDocsOnlyPath(filePath: string): boolean {
  return (
    filePath === "README.md" ||
    filePath.endsWith(".md") ||
    filePath.startsWith("docs/")
  );
}
