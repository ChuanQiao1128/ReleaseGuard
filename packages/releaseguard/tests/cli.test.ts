import { describe, expect, it } from "vitest";
import { assertExpectedDecision, parseCliArgs } from "../src/cli";

describe("parseCliArgs", () => {
  it("parses base and head run arguments", () => {
    expect(parseCliArgs(["run", "--base", "main", "--head", "feature"])).toEqual({
      command: "run",
      base: "main",
      head: "feature",
    });
  });

  it("parses fixture run arguments", () => {
    expect(
      parseCliArgs(["run", "--fixture", "demo-discount-regression"]),
    ).toEqual({
      command: "run",
      fixture: "demo-discount-regression",
    });
  });

  it("parses docs-only fixture run arguments", () => {
    expect(parseCliArgs(["run", "--fixture", "demo-docs-only"])).toEqual({
      command: "run",
      fixture: "demo-docs-only",
    });
  });

  it("parses coverage supplemental fixture run arguments", () => {
    expect(
      parseCliArgs([
        "run",
        "--fixture",
        "demo-coverage-supplemental-evidence",
        "--coverage",
        "packages/releaseguard/fixtures/coverage/lcov.info",
      ]),
    ).toEqual({
      command: "run",
      fixture: "demo-coverage-supplemental-evidence",
      coverageFile: "packages/releaseguard/fixtures/coverage/lcov.info",
    });
  });

  it("parses expected decision checks", () => {
    expect(
      parseCliArgs([
        "run",
        "--fixture",
        "demo-discount-regression",
        "--expect-decision",
        "BLOCK",
      ]),
    ).toEqual({
      command: "run",
      fixture: "demo-discount-regression",
      expectDecision: "BLOCK",
    });
  });

  it("parses run coverage arguments", () => {
    expect(
      parseCliArgs([
        "run",
        "--base",
        "main",
        "--head",
        "HEAD",
        "--coverage",
        "coverage/lcov.info",
      ]),
    ).toEqual({
      command: "run",
      base: "main",
      head: "HEAD",
      coverageFile: "coverage/lcov.info",
    });
  });

  it("parses memory index arguments", () => {
    expect(parseCliArgs(["memory", "index"])).toEqual({
      command: "memory",
      action: "index",
    });
  });

  it("parses memory benchmark arguments", () => {
    expect(parseCliArgs(["memory", "benchmark"])).toEqual({
      command: "memory",
      action: "benchmark",
    });
  });

  it("parses memory discount context demo arguments", () => {
    expect(parseCliArgs(["memory", "demo-discount-context"])).toEqual({
      command: "memory",
      action: "demo-discount-context",
    });
  });

  it("parses memory search arguments", () => {
    expect(
      parseCliArgs(["memory", "search", "--query", "discount checkout"]),
    ).toEqual({
      command: "memory",
      action: "search",
      query: "discount checkout",
    });
  });

  it("parses scanner eval arguments", () => {
    expect(parseCliArgs(["scanner", "eval", "--root", "../repo"])).toEqual({
      command: "scanner",
      action: "eval",
      root: "../repo",
    });
  });

  it("parses scanner eval coverage arguments", () => {
    expect(
      parseCliArgs([
        "scanner",
        "eval",
        "--root",
        "../repo",
        "--coverage",
        "coverage/lcov.info",
      ]),
    ).toEqual({
      command: "scanner",
      action: "eval",
      root: "../repo",
      coverageFile: "coverage/lcov.info",
    });
  });

  it("parses coverage ingest arguments", () => {
    expect(
      parseCliArgs([
        "coverage",
        "ingest",
        "--file",
        "coverage/cobertura.xml",
        "--provider",
        "cobertura",
      ]),
    ).toEqual({
      command: "coverage",
      action: "ingest",
      file: "coverage/cobertura.xml",
      provider: "cobertura",
    });
  });

  it("rejects memory without index", () => {
    expect(() => parseCliArgs(["memory"])).toThrow(
      "memory requires one of: index, benchmark, demo-discount-context, search.",
    );
  });

  it("rejects memory search without a query", () => {
    expect(() => parseCliArgs(["memory", "search"])).toThrow(
      "memory search requires --query.",
    );
  });

  it("rejects invalid expected decisions", () => {
    expect(() =>
      parseCliArgs([
        "run",
        "--fixture",
        "demo-docs-only",
        "--expect-decision",
        "MERGE",
      ]),
    ).toThrow("--expect-decision must be one of PASS, WARN, or BLOCK");
  });

  it("rejects scanner eval without a root", () => {
    expect(() => parseCliArgs(["scanner", "eval"])).toThrow(
      "scanner eval requires --root.",
    );
  });

  it("rejects coverage ingest without a file", () => {
    expect(() => parseCliArgs(["coverage", "ingest"])).toThrow(
      "coverage ingest requires --file.",
    );
  });

  it("rejects run without diff or fixture arguments", () => {
    expect(() => parseCliArgs(["run"])).toThrow(
      "run requires --base/--head or --fixture.",
    );
  });

  it("throws when the expected decision does not match", () => {
    expect(() => assertExpectedDecision("WARN", "BLOCK")).toThrow(
      "Expected decision BLOCK, received WARN.",
    );
  });
});
