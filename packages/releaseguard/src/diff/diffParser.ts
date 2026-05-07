import { ChangedFile, getChangedFilesFromGitDiff } from "./gitDiffProvider";
import { analyzeScope, ScopeAnalysis } from "./scopeAnalyzer";

export type ChangeScope =
  | {
      mode: "fixture";
      fixture:
        | "demo-discount-regression"
        | "demo-missing-evidence"
        | "demo-rag-elevated-evidence";
      changedFiles: string[];
      scope: ScopeAnalysis;
      docsOnly: false;
    }
  | {
      mode: "fixture";
      fixture: "demo-docs-only";
      changedFiles: string[];
      scope: ScopeAnalysis;
      docsOnly: true;
    }
  | {
      mode: "git";
      base: string;
      head: string;
      changedFiles: string[];
      changedFileDetails: ChangedFile[];
      scope: ScopeAnalysis;
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
      args.fixture !== "demo-missing-evidence" &&
      args.fixture !== "demo-rag-elevated-evidence" &&
      args.fixture !== "demo-docs-only"
    ) {
      throw new Error(`Unknown fixture: ${args.fixture}`);
    }
    const changedFiles =
      args.fixture === "demo-docs-only"
        ? ["README.md"]
        : ["apps/demo-app/src/app/api/discount/apply/route.ts"];
    const scope = analyzeScope(changedFiles);
    if (args.fixture === "demo-docs-only") {
      return {
        mode: "fixture",
        fixture: "demo-docs-only",
        changedFiles,
        scope,
        docsOnly: true,
      };
    }

    return {
      mode: "fixture",
      fixture: args.fixture,
      changedFiles,
      scope,
      docsOnly: false,
    };
  }

  if (!args.base || !args.head) {
    throw new Error("releaseguard run requires --base/--head or --fixture.");
  }

  const changedFileDetails = await getChangedFilesFromGitDiff({
    rootDir: args.rootDir,
    base: args.base,
    head: args.head,
  });
  const changedFiles = changedFileDetails.map((file) => file.path);

  const scope = analyzeScope(changedFiles);
  return {
    mode: "git",
    base: args.base,
    head: args.head,
    changedFiles,
    changedFileDetails,
    scope,
    docsOnly: scope.classification === "docs_only",
  };
}
