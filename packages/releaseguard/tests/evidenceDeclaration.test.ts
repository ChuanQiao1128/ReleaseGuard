import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addNode, createCapabilityGraph } from "../src/graph/capabilityGraph";
import { CapabilityNode } from "../src/graph/types";
import {
  parseEvidenceDeclarations,
  scanTests,
} from "../src/scanner/testScanner";

const tempDirs: string[] = [];

describe("ReleaseGuard evidence declarations", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it("parses coverage annotations from test comments", () => {
    const declarations = parseEvidenceDeclarations(
      "// @releaseguard:covers api_apply_discount invalid_discount 400 error_status\n",
    );

    expect(declarations).toEqual([
      expect.objectContaining({
        capabilityId: "api_apply_discount",
        caseTags: ["invalid_discount", "400", "error_status"],
        line: 1,
      }),
    ]);
  });

  it("attaches declared evidence to known capability nodes", async () => {
    const rootDir = await tempRepo();
    await writeFile(
      rootDir,
      "tests/api/discount.test.ts",
      [
        "import { describe, it } from 'vitest';",
        "// @releaseguard:covers api_apply_discount invalid_discount 400 error_status",
        "describe('discount', () => { it('rejects invalid codes', () => {}); });",
      ].join("\n"),
    );
    const graph = createCapabilityGraph(rootDir);
    addNode(graph, apiApplyDiscountNode());

    await scanTests(rootDir, rootDir, graph);

    const declaredTest = Object.values(graph.nodes).find(
      (node) => node.type === "test",
    );
    expect(declaredTest).toMatchObject({
      confidenceBasis: "releaseguard_evidence_declaration",
      metadata: expect.objectContaining({
        targetCapability: "api_apply_discount",
        testFile: "tests/api/discount.test.ts",
        evidenceDeclaration: true,
        caseTags: ["invalid_discount", "400", "error_status"],
      }),
    });
    expect(Object.values(graph.edges)).toContainEqual(
      expect.objectContaining({
        type: "tested_by",
        source: "api_apply_discount",
        target: declaredTest?.id,
        confidenceBasis: "releaseguard_evidence_declaration",
      }),
    );
  });

  it("prefers declarations over heuristic discount test detection", async () => {
    const rootDir = await tempRepo();
    await writeFile(
      rootDir,
      "apps/demo-app/tests/api/discount.test.ts",
      [
        "import { POST } from '../../src/app/api/discount/apply/route';",
        "// @releaseguard:covers api_apply_discount valid_discount success_status",
        "it('returns 400 for an invalid discount', () => { expect(400).toBe(400); });",
      ].join("\n"),
    );
    const graph = createCapabilityGraph(rootDir);
    addNode(graph, apiApplyDiscountNode());

    await scanTests(rootDir, path.join(rootDir, "apps/demo-app"), graph);

    expect(graph.nodes.test_api_discount_invalid).toBeUndefined();
    const declaredTests = Object.values(graph.nodes).filter(
      (node) => node.type === "test",
    );
    expect(declaredTests).toHaveLength(1);
    expect(declaredTests[0].metadata.caseTags).toEqual([
      "valid_discount",
      "success_status",
    ]);
  });

  it("does not invent unknown capability IDs from declarations", async () => {
    const rootDir = await tempRepo();
    await writeFile(
      rootDir,
      "tests/unknown.test.ts",
      "// @releaseguard:covers api_not_real invalid_discount\n",
    );
    const graph = createCapabilityGraph(rootDir);

    await scanTests(rootDir, rootDir, graph);

    expect(Object.values(graph.nodes).filter((node) => node.type === "test")).toEqual(
      [],
    );
  });
});

function apiApplyDiscountNode(): CapabilityNode {
  return {
    id: "api_apply_discount",
    type: "api",
    name: "POST /api/discount/apply",
    target: "POST /api/discount/apply",
    risk: "high",
    confidence: "high",
    confidenceBasis: "test_fixture",
    evidenceRefs: [],
    metadata: {
      method: "POST",
      path: "/api/discount/apply",
    },
  };
}

async function tempRepo(): Promise<string> {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "releaseguard-evidence-declaration-"),
  );
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
  await fs.writeFile(absolutePath, `${content}\n`);
}
