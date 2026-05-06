import path from "node:path";
import { describe, expect, it } from "vitest";
import { chunkMarkdownFile } from "../src/memory/markdownChunker";
import { tagRepoMemoryChunk } from "../src/memory/capabilityTagger";
import { loadRepoMemoryChunks } from "../src/memory/sourceLoader";
import { scanRepository } from "../src/scanner/repoScanner";

const repoRoot = path.resolve(process.cwd(), "../..");

describe("Repo Memory capability tagger", () => {
  it("maps discount API file path mentions to api_apply_discount", async () => {
    const { graph } = await scanRepository(repoRoot);
    const chunk = onlyChunk(
      "The file apps/demo-app/src/app/api/discount/apply/route.ts changed discount validation.",
    );

    const tagged = tagRepoMemoryChunk(chunk, { graph });

    expect(tagged.related_capability_ids).toEqual(["api_apply_discount"]);
    expect(tagged.related_file_paths).toEqual([
      "apps/demo-app/src/app/api/discount/apply/route.ts",
    ]);
    expect(tagged.tagging_status).toBe("tagged");
    expect(tagged.tagging_confidence).toBe("high");
    expect(tagged.tagging_basis).toBe("direct_file_path");
  });

  it("maps checkout file path mentions to route_checkout", async () => {
    const { graph } = await scanRepository(repoRoot);
    const chunk = onlyChunk(
      "The file apps/demo-app/src/app/checkout/page.tsx owns the checkout route.",
    );

    const tagged = tagRepoMemoryChunk(chunk, { graph });

    expect(tagged.related_capability_ids).toEqual(["route_checkout"]);
    expect(tagged.tagging_confidence).toBe("high");
  });

  it("maps discount and checkout keywords conservatively", async () => {
    const { graph } = await scanRepository(repoRoot);
    const chunk = onlyChunk(
      "Discount validation during checkout has historical risk for invalid discount codes.",
    );

    const tagged = tagRepoMemoryChunk(chunk, { graph });

    expect(tagged.related_capability_ids).toEqual(
      expect.arrayContaining(["api_apply_discount", "route_checkout"]),
    );
    expect(tagged.tagging_confidence).toBe("medium");
    expect(tagged.tagging_basis).toBe("keyword_match");
  });

  it("leaves unrelated markdown unresolved", async () => {
    const { graph } = await scanRepository(repoRoot);
    const chunk = onlyChunk("Profile preferences control notification settings.");

    const tagged = tagRepoMemoryChunk(chunk, { graph });

    expect(tagged.related_capability_ids).toEqual([]);
    expect(tagged.tagging_status).toBe("unresolved");
    expect(tagged.tagging_confidence).toBe("unresolved");
  });

  it("does not emit unknown capability IDs", async () => {
    const { graph } = await scanRepository(repoRoot);
    const chunks = await loadRepoMemoryChunks(repoRoot);

    for (const chunk of chunks.map((item) => tagRepoMemoryChunk(item, { graph }))) {
      for (const capabilityId of chunk.related_capability_ids) {
        expect(graph.nodes[capabilityId]).toBeDefined();
      }
    }
  });
});

function onlyChunk(text: string) {
  return chunkMarkdownFile({
    filePath: "docs/test.md",
    sourceType: "doc",
    markdown: `# Test\n\n${text}`,
  })[0];
}
