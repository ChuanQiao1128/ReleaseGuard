import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ChangedFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "unknown";

export type ChangedFile = {
  path: string;
  status: ChangedFileStatus;
};

export async function getChangedFilesFromGitDiff(args: {
  rootDir: string;
  base: string;
  head: string;
}): Promise<ChangedFile[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      [
        "diff",
        "--name-only",
        "--diff-filter=ACMRT",
        args.base,
        args.head,
      ],
      { cwd: args.rootDir },
    );

    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((filePath) => ({
        path: filePath,
        status: "unknown" as const,
      }));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Real diff mode requires a git repository and valid refs. Use --fixture for demo mode. ${detail}`,
    );
  }
}
