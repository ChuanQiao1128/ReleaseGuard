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

  it("rejects memory without index", () => {
    expect(() => parseCliArgs(["memory"])).toThrow(
      "memory requires one of: index, benchmark, demo-discount-context.",
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
