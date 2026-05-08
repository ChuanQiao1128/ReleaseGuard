import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chunkMarkdownFile } from "../src/memory/markdownChunker";
import { writeRepoMemoryIndex } from "../src/memory/memoryIndex";
import { loadRepoMemoryChunks } from "../src/memory/sourceLoader";

const tempDirs: string[] = [];

describe("repo memory loader and chunker", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it("loads markdown docs into typed chunks", async () => {
    const rootDir = await tempRepo();
    await writeFile(
      rootDir,
      "docs/overview.md",
      "# Overview\n\nReleaseGuard connects PR impact to evidence.\n",
    );

    const chunks = await loadRepoMemoryChunks(rootDir);

    expect(chunks).toEqual([
      expect.objectContaining({
        source_type: "doc",
        title: "Overview",
        file_path: "docs/overview.md",
        heading_path: ["Overview"],
        text: "# Overview\n\nReleaseGuard connects PR impact to evidence.",
        related_capability_ids: [],
        related_file_paths: [],
        tagging_status: "unresolved",
        tagging_confidence: "unresolved",
        trust_tier: "context_only",
      }),
    ]);
  });

  it("splits markdown by headings", () => {
    const chunks = chunkMarkdownFile({
      filePath: "docs/guide.md",
      sourceType: "doc",
      markdown: [
        "# Guide",
        "",
        "Intro.",
        "",
        "## Install",
        "",
        "Install text.",
        "",
        "## Run",
        "",
        "Run text.",
      ].join("\n"),
    });

    expect(chunks.map((chunk) => chunk.heading_path)).toEqual([
      ["Guide"],
      ["Guide", "Install"],
      ["Guide", "Run"],
    ]);
    expect(chunks.map((chunk) => chunk.title)).toEqual([
      "Guide",
      "Install",
      "Run",
    ]);
  });

  it("handles missing docs and reports directories gracefully", async () => {
    const rootDir = await tempRepo();

    await expect(loadRepoMemoryChunks(rootDir)).resolves.toEqual([]);
  });

  it("ignores non-markdown files and empty markdown files", async () => {
    const rootDir = await tempRepo();
    await writeFile(rootDir, "docs/notes.txt", "not markdown");
    await writeFile(rootDir, "docs/empty.md", "\n\n");
    await writeFile(rootDir, "docs/keep.md", "# Keep\n\nUseful text.\n");

    const chunks = await loadRepoMemoryChunks(rootDir);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      title: "Keep",
      file_path: "docs/keep.md",
    });
  });

  it("ignores scanner evaluation reports when loading repo memory", async () => {
    const rootDir = await tempRepo();
    await writeFile(rootDir, "docs/keep.md", "# Keep\n\nUseful text.\n");
    await writeFile(
      rootDir,
      "docs/scanner_eval/summary.md",
      "# Scanner Eval\n\nEvaluation artifacts are not repo memory.\n",
    );

    const chunks = await loadRepoMemoryChunks(rootDir);

    expect(chunks.map((chunk) => chunk.file_path)).toEqual(["docs/keep.md"]);
  });

  it("ignores sample report gallery artifacts when loading repo memory", async () => {
    const rootDir = await tempRepo();
    await writeFile(rootDir, "docs/keep.md", "# Keep\n\nUseful text.\n");
    await writeFile(
      rootDir,
      "docs/sample_reports/block-discount-regression/report.md",
      "# ReleaseGuard Report\n\nDecision: BLOCK\n",
    );

    const chunks = await loadRepoMemoryChunks(rootDir);

    expect(chunks.map((chunk) => chunk.file_path)).toEqual(["docs/keep.md"]);
  });

  it("ignores external quickstart docs when loading repo memory", async () => {
    const rootDir = await tempRepo();
    await writeFile(rootDir, "docs/keep.md", "# Keep\n\nUseful text.\n");
    await writeFile(
      rootDir,
      "docs/external_quickstart.md",
      "# External Quickstart\n\nOperational install docs are not repo memory.\n",
    );

    const chunks = await loadRepoMemoryChunks(rootDir);

    expect(chunks.map((chunk) => chunk.file_path)).toEqual(["docs/keep.md"]);
  });

  it("loads previous ReleaseGuard reports from .releaseguard/reports", async () => {
    const rootDir = await tempRepo();
    await writeFile(
      rootDir,
      ".releaseguard/reports/report.md",
      "# ReleaseGuard Report\n\nDecision: WARN\n\n## Affected capabilities\n\n- api_apply_discount\n",
    );

    const chunks = await loadRepoMemoryChunks(rootDir);

    expect(chunks.map((chunk) => chunk.source_type)).toEqual([
      "releaseguard_report",
      "releaseguard_report",
    ]);
    expect(chunks.map((chunk) => chunk.heading_path)).toEqual([
      ["ReleaseGuard Report"],
      ["ReleaseGuard Report", "Affected capabilities"],
    ]);
  });

  it("produces stable chunk ids", () => {
    const markdown = "# Stable\n\nSame text.\n";

    const first = chunkMarkdownFile({
      filePath: "docs/stable.md",
      sourceType: "doc",
      markdown,
    });
    const second = chunkMarkdownFile({
      filePath: "docs/stable.md",
      sourceType: "doc",
      markdown,
    });

    expect(first.map((chunk) => chunk.chunk_id)).toEqual(
      second.map((chunk) => chunk.chunk_id),
    );
  });

  it("writes .releaseguard/memory_chunks.json", async () => {
    const rootDir = await tempRepo();
    await writeFile(
      rootDir,
      "docs/adr/0007-checkout-critical-flow.md",
      "# Checkout Critical Flow\n\nCheckout failures block revenue.\n",
    );
    await writeFile(
      rootDir,
      "docs/incidents/2024-08-discount-crash.md",
      "# Discount Crash\n\n## Impact\n\nCheckout returned 500.\n",
    );

    const result = await writeRepoMemoryIndex(rootDir);
    const json = JSON.parse(await fs.readFile(result.outputPath, "utf8"));

    expect(path.relative(rootDir, result.outputPath).split(path.sep).join("/")).toBe(
      ".releaseguard/memory_chunks.json",
    );
    expect(json).toEqual(result.chunks);
    expect(result.chunks.map((chunk) => chunk.source_type)).toEqual([
      "adr",
      "incident",
      "incident",
    ]);
  });
});

async function tempRepo(): Promise<string> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "releaseguard-memory-"));
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
