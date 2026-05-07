import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ChangeScope } from "../src/diff/diffParser";
import { analyzeScope } from "../src/diff/scopeAnalyzer";
import { scanRepository } from "../src/scanner/repoScanner";
import { resolveImpact } from "../src/impact/impactResolver";
import { runReleaseGuardWithScope } from "../src/run";

const repoRoot = path.resolve(process.cwd(), "../..");
const tempDirs: string[] = [];

describe("universal impact layer", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it("maps unknown source files to file/module fallback and WARN", async () => {
    const rootDir = await tempRepo();
    await writeFile(rootDir, "backend/app/routes/users.py", "def list_users(): pass\n");

    const result = await runReleaseGuardWithScope({
      rootDir,
      scope: makeGitScope(["backend/app/routes/users.py"]),
    });

    expect(result.decision.decision).toBe("WARN");
    expect(result.decision.reason).toContain("package/module boundary only");
  });

  it("maps dependency/config changes to WARN instead of PASS", async () => {
    const rootDir = await tempRepo();
    await writeFile(rootDir, "package.json", JSON.stringify({ name: "demo" }));
    await writeFile(rootDir, "tsconfig.json", "{}\n");

    const result = await runReleaseGuardWithScope({
      rootDir,
      scope: makeGitScope(["package.json"]),
    });

    expect(result.decision.decision).toBe("WARN");
    expect(result.decision.reason).toContain("package/module boundary only");
  });

  it("keeps docs-only changes as PASS", async () => {
    const rootDir = await tempRepo();
    await writeFile(rootDir, "README.md", "# Demo\n");

    const result = await runReleaseGuardWithScope({
      rootDir,
      scope: makeGitScope(["README.md"]),
    });

    expect(result.decision).toEqual({
      decision: "PASS",
      reason: "low-risk docs-only change.",
    });
  });

  it("maps the Next.js demo route/API file at L3 or higher", async () => {
    const { graph } = await scanRepository(repoRoot);
    const resolution = resolveImpact({
      changedFiles: ["apps/demo-app/src/app/api/discount/apply/route.ts"],
      graph,
    });

    expect(resolution.items[0]).toMatchObject({
      resolutionLevel: "L3_FRAMEWORK_CAPABILITY_MAPPED",
    });
    expect(resolution.failSafeWarn).toBe(false);
  });

  it("maps declared test evidence at L5", async () => {
    const rootDir = await tempRepo();
    await writeFile(rootDir, "package.json", JSON.stringify({ name: "demo" }));
    await writeFile(rootDir, "tsconfig.json", "{}\n");
    await writeFile(
      rootDir,
      "src/app/api/discount/apply/route.ts",
      "export function POST() {}\n",
    );
    await writeFile(
      rootDir,
      "src/app/checkout/page.tsx",
      "export default function Page() { return null; }\n",
    );
    await writeFile(
      rootDir,
      "tests/api/discount.test.ts",
      "// @releaseguard:covers api_apply_discount invalid_discount 400 error_status\n",
    );

    const { graph } = await scanRepository(rootDir);
    const resolution = resolveImpact({
      changedFiles: ["tests/api/discount.test.ts"],
      graph,
    });

    expect(resolution.items[0]).toMatchObject({
      resolutionLevel: "L5_DECLARED_CAPABILITY_MAPPED",
    });
  });
});

function makeGitScope(changedFiles: string[]): ChangeScope {
  const scope = analyzeScope(changedFiles);
  return {
    mode: "git",
    base: "base-ref",
    head: "head-ref",
    changedFiles,
    changedFileDetails: changedFiles.map((filePath) => ({
      path: filePath,
      status: "unknown",
    })),
    scope,
    docsOnly: scope.classification === "docs_only",
  };
}

async function tempRepo(): Promise<string> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "releaseguard-universal-"));
  tempDirs.push(rootDir);
  return rootDir;
}

async function writeFile(
  rootDir: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const absolutePath = path.join(rootDir, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content);
}
