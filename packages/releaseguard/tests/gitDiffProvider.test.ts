import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { getChangedFilesFromGitDiff } from "../src/diff/gitDiffProvider";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

describe("GitDiffProvider", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it("reads changed file paths from git diff", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "releaseguard-git-"));
    tempDirs.push(rootDir);
    await git(rootDir, "init");
    await git(rootDir, "config", "user.email", "releaseguard@example.test");
    await git(rootDir, "config", "user.name", "ReleaseGuard Test");
    await fs.mkdir(path.join(rootDir, "apps/demo-app/src/app/api/discount/apply"), {
      recursive: true,
    });
    await fs.writeFile(path.join(rootDir, "README.md"), "base\n");
    await fs.writeFile(
      path.join(rootDir, "apps/demo-app/src/app/api/discount/apply/route.ts"),
      "export async function POST() {}\n",
    );
    await git(rootDir, "add", ".");
    await git(rootDir, "commit", "-m", "base");
    const baseSha = (await git(rootDir, "rev-parse", "HEAD")).trim();

    await fs.writeFile(path.join(rootDir, "README.md"), "changed\n");
    await fs.writeFile(
      path.join(rootDir, "apps/demo-app/src/app/api/discount/apply/route.ts"),
      "export async function POST() { return Response.json({ ok: true }); }\n",
    );
    await git(rootDir, "add", ".");
    await git(rootDir, "commit", "-m", "head");
    const headSha = (await git(rootDir, "rev-parse", "HEAD")).trim();

    const changedFiles = await getChangedFilesFromGitDiff({
      rootDir,
      base: baseSha,
      head: headSha,
    });

    expect(changedFiles).toEqual([
      { path: "README.md", status: "unknown" },
      {
        path: "apps/demo-app/src/app/api/discount/apply/route.ts",
        status: "unknown",
      },
    ]);
  });

  it("fails clearly when refs are invalid", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "releaseguard-git-"));
    tempDirs.push(rootDir);
    await git(rootDir, "init");

    await expect(
      getChangedFilesFromGitDiff({
        rootDir,
        base: "missing-base",
        head: "missing-head",
      }),
    ).rejects.toThrow(
      "Real diff mode requires a git repository and valid refs. Use --fixture for demo mode.",
    );
  });
});

async function git(rootDir: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: rootDir });
  return stdout;
}
