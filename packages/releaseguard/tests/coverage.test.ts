import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCobertura } from "../src/coverage/coberturaParser";
import {
  ingestCoverageFile,
  writeCoverageReport,
} from "../src/coverage/coverageIngest";
import { parseLcov } from "../src/coverage/lcovParser";
import { normalizeCoverageFilePath } from "../src/coverage/pathUtils";

const repoRoot = path.resolve(process.cwd(), "../..");

describe("coverage ingestion", () => {
  it("parses LCOV files and maps covered paths", async () => {
    const fixturePath = path.join(
      repoRoot,
      "packages/releaseguard/fixtures/coverage/lcov.info",
    );
    const report = parseLcov({
      content: await fs.readFile(fixturePath, "utf8"),
      repoRoot,
      sourcePath: fixturePath,
    });

    expect(report.provider).toBe("lcov");
    expect(report.file_count).toBe(3);
    expect(report.covered_file_count).toBe(3);
    expect(report.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          normalized_file_path:
            "apps/demo-app/src/app/api/discount/apply/route.ts",
          covered_lines: [1, 2, 3, 4],
          uncovered_lines: [5],
          line_coverage_percent: 80,
        }),
        expect.objectContaining({
          normalized_file_path: "apps/demo-app/src/lib/unknown-helper.ts",
          covered_lines: [1, 2],
          uncovered_lines: [3],
          line_coverage_percent: 66.67,
        }),
      ]),
    );
  });

  it("parses Cobertura XML files and handles uncovered files", async () => {
    const fixturePath = path.join(
      repoRoot,
      "packages/releaseguard/fixtures/coverage/cobertura.xml",
    );
    const report = parseCobertura({
      content: await fs.readFile(fixturePath, "utf8"),
      repoRoot,
      sourcePath: fixturePath,
    });

    expect(report.provider).toBe("cobertura");
    expect(report.file_count).toBe(2);
    expect(report.covered_file_count).toBe(1);
    expect(report.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          normalized_file_path: "backend/app/routes/discount.py",
          covered_lines: [1, 2, 4],
          uncovered_lines: [3],
          line_coverage_percent: 75,
        }),
        expect.objectContaining({
          normalized_file_path: "backend/app/routes/users.py",
          covered_lines: [],
          uncovered_lines: [1],
          line_coverage_percent: 0,
        }),
      ]),
    );
  });

  it("normalizes coverage paths and rejects absolute paths outside the repo", () => {
    expect(
      normalizeCoverageFilePath(
        repoRoot,
        path.join(repoRoot, "apps/demo-app/src/app/checkout/page.tsx"),
      ),
    ).toBe("apps/demo-app/src/app/checkout/page.tsx");
    expect(normalizeCoverageFilePath(repoRoot, "/tmp/outside.ts")).toBeUndefined();
    expect(normalizeCoverageFilePath(repoRoot, "../outside.ts")).toBeUndefined();
  });

  it("writes .releaseguard/coverage/coverage_report.json", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "releaseguard-coverage-"));
    await fs.mkdir(path.join(tempRoot, "coverage"), { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, "coverage/lcov.info"),
      [
        "SF:src/index.ts",
        "DA:1,1",
        "DA:2,0",
        "LH:1",
        "LF:2",
        "end_of_record",
      ].join("\n"),
    );

    const { report, outputPath } = await writeCoverageReport({
      repoRoot: tempRoot,
      coverageFile: "coverage/lcov.info",
    });
    const written = JSON.parse(await fs.readFile(outputPath, "utf8"));

    expect(report.file_count).toBe(1);
    expect(outputPath).toBe(
      path.join(tempRoot, ".releaseguard/coverage/coverage_report.json"),
    );
    expect(written.records[0].normalized_file_path).toBe("src/index.ts");
  });

  it("auto-detects coverage provider during ingestion", async () => {
    const report = await ingestCoverageFile({
      repoRoot,
      coverageFile: "packages/releaseguard/fixtures/coverage/cobertura.xml",
    });

    expect(report.provider).toBe("cobertura");
    expect(report.file_count).toBeGreaterThan(0);
  });
});
