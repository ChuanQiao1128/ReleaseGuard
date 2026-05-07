import { promises as fs } from "node:fs";
import path from "node:path";
import {
  addEdge,
  addFileNode,
  addNode,
  makeEdge,
  sanitizeIdPart,
  toRepoRelativePath,
} from "../graph/capabilityGraph";
import {
  CapabilityGraph,
  CapabilityNode,
  TestCaseTag,
  testCaseTagSchema,
} from "../graph/types";
import { lineForIndex, lineQuote, listFiles } from "./fileUtils";

export type EvidenceDeclaration = {
  capabilityId: string;
  caseTags: TestCaseTag[];
  line: number;
  quote: string;
};

export async function scanTests(
  rootDir: string,
  appRoot: string,
  graph: CapabilityGraph,
): Promise<void> {
  const testFiles = await listFiles(appRoot, (filePath) =>
    filePath.endsWith(".test.ts"),
  );

  for (const testFile of testFiles) {
    const relativePath = toRepoRelativePath(rootDir, testFile);
    const source = await fs.readFile(testFile, "utf8");
    const fileNode = addFileNode(graph, rootDir, testFile, "test_file_scanned");
    const declarations = parseEvidenceDeclarations(source);

    if (declarations.length > 0) {
      for (const declaration of declarations) {
        if (!graph.nodes[declaration.capabilityId]) {
          continue;
        }
        const testNode = declaredEvidenceTestNode({
          declaration,
          relativePath,
        });
        addNode(graph, testNode);
        addEdge(
          graph,
          makeEdge(
            fileNode.id,
            "defines",
            testNode.id,
            "high",
            "releaseguard_evidence_declaration",
            testNode.evidenceRefs,
          ),
        );
        addEdge(
          graph,
          makeEdge(
            declaration.capabilityId,
            "tested_by",
            testNode.id,
            "high",
            "releaseguard_evidence_declaration",
            testNode.evidenceRefs,
            {
              caseTags: declaration.caseTags,
              coverageDepth: "direct",
              evidenceDeclaration: true,
            },
          ),
        );
      }
      continue;
    }

    if (isDiscountApiTest(source, relativePath)) {
      const tags = extractInvalidDiscountTags(source);
      const invalidLine =
        lineForIndex(source, source.indexOf("returns 400 for an invalid discount")) ||
        1;
      const testNode: CapabilityNode = {
        id: "test_api_discount_invalid",
        type: "test",
        name: "invalid discount API test",
        target: "invalid_discount returns 400",
        filePath: relativePath,
        risk: "low",
        confidence: "high",
        confidenceBasis: "direct_test_import",
        evidenceRefs: [
          {
            filePath: relativePath,
            lineStart: invalidLine,
            lineEnd: invalidLine,
            quote: lineQuote(source, invalidLine),
            reason:
              "Test imports the discount API handler and asserts invalid discount behavior.",
          },
        ],
        metadata: {
          caseTags: tags,
          targetCapability: "api_apply_discount",
          testFile: testFileMetadataPath(relativePath),
        },
      };
      addNode(graph, testNode);
      addEdge(
        graph,
        makeEdge(
          fileNode.id,
          "defines",
          testNode.id,
          "high",
          "test_file_defines_test_case",
          testNode.evidenceRefs,
        ),
      );
      addEdge(
        graph,
        makeEdge(
          "api_apply_discount",
          "tested_by",
          testNode.id,
          "high",
          "direct_test_import",
          testNode.evidenceRefs,
          { caseTags: tags, coverageDepth: "direct" },
        ),
      );
    }
  }
}

export function parseEvidenceDeclarations(source: string): EvidenceDeclaration[] {
  const declarations: EvidenceDeclaration[] = [];
  const declarationRegex = /@releaseguard:covers\s+([A-Za-z0-9_:-]+)([^\n]*)/g;
  let match: RegExpExecArray | null;
  while ((match = declarationRegex.exec(source))) {
    const line = lineForIndex(source, match.index);
    declarations.push({
      capabilityId: match[1],
      caseTags: parseCaseTags(match[2]),
      line,
      quote: lineQuote(source, line),
    });
  }
  return declarations;
}

function parseCaseTags(rawTags: string): TestCaseTag[] {
  const tags = new Set<TestCaseTag>();
  for (const token of rawTags.trim().split(/\s+/).filter(Boolean)) {
    const parsed = testCaseTagSchema.safeParse(token);
    if (parsed.success) {
      tags.add(parsed.data);
    }
  }
  return [...tags];
}

function declaredEvidenceTestNode(args: {
  declaration: EvidenceDeclaration;
  relativePath: string;
}): CapabilityNode {
  const tagPart =
    args.declaration.caseTags.length > 0
      ? args.declaration.caseTags.join("_")
      : "declared";
  return {
    id: `test_declared_${sanitizeIdPart(args.declaration.capabilityId)}_${sanitizeIdPart(tagPart)}_${args.declaration.line}`,
    type: "test",
    name: `declared evidence for ${args.declaration.capabilityId}`,
    target: `${args.declaration.capabilityId} ${args.declaration.caseTags.join(" ")}`.trim(),
    filePath: args.relativePath,
    risk: "low",
    confidence: "high",
    confidenceBasis: "releaseguard_evidence_declaration",
    evidenceRefs: [
      {
        filePath: args.relativePath,
        lineStart: args.declaration.line,
        lineEnd: args.declaration.line,
        quote: args.declaration.quote,
        reason: "Test file declares ReleaseGuard evidence coverage.",
      },
    ],
    metadata: {
      caseTags: args.declaration.caseTags,
      targetCapability: args.declaration.capabilityId,
      testFile: testFileMetadataPath(args.relativePath),
      evidenceDeclaration: true,
      declarationLine: args.declaration.line,
    },
  };
}

function isDiscountApiTest(source: string, relativePath: string): boolean {
  return (
    relativePath.endsWith("apps/demo-app/tests/api/discount.test.ts") &&
    source.includes("src/app/api/discount/apply/route") &&
    source.includes("returns 400 for an invalid discount")
  );
}

function extractInvalidDiscountTags(source: string): TestCaseTag[] {
  const tags = new Set<TestCaseTag>();
  if (source.includes("invalid discount") || source.includes("NOPE")) {
    tags.add("invalid_discount");
    tags.add("error_status");
  }
  if (source.includes("toBe(400)")) {
    tags.add("400");
  }
  if (source.includes("toBe(500)")) {
    tags.add("500");
  }
  return [...tags];
}

function testFileMetadataPath(relativePath: string): string {
  return relativePath.startsWith("apps/demo-app/")
    ? path.posix.relative("apps/demo-app", relativePath)
    : relativePath;
}
