import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findResolvableApiCallsites,
  findUnsupportedFetches,
} from "../src/scanner/fetchLiteralScanner";
import { scanRepository } from "../src/scanner/repoScanner";

const repoRoot = path.resolve(process.cwd(), "../..");

describe("repo scanner", () => {
  it("detects the demo route, API, direct fetch, and tagged invalid discount test", async () => {
    const { graph, result } = await scanRepository(repoRoot);

    expect(graph.nodes.route_checkout).toMatchObject({
      type: "route",
      target: "/checkout",
      risk: "high",
      confidence: "high",
      confidenceBasis: "nextjs_file_route",
    });
    expect(graph.nodes.api_apply_discount).toMatchObject({
      type: "api",
      target: "POST /api/discount/apply",
      risk: "high",
      confidence: "high",
      confidenceBasis: "nextjs_route_handler_export",
    });

    expect(Object.values(graph.edges)).toContainEqual(
      expect.objectContaining({
        type: "consumes",
        source: "route_checkout",
        target: "api_apply_discount",
        confidence: "high",
        confidenceBasis: "direct_fetch_literal",
      }),
    );
    expect(graph.nodes.test_api_discount_invalid).toMatchObject({
      type: "test",
      metadata: expect.objectContaining({
        targetCapability: "api_apply_discount",
        testFile: "tests/api/discount.test.ts",
        caseTags: expect.arrayContaining([
          "invalid_discount",
          "400",
          "error_status",
        ]),
      }),
    });
    expect(Object.values(graph.edges)).toContainEqual(
      expect.objectContaining({
        type: "tested_by",
        source: "api_apply_discount",
        target: "test_api_discount_invalid",
      }),
    );
    expect(result.coverage.resolvedCallsites).toContainEqual(
      expect.objectContaining({
        routeId: "route_checkout",
        apiId: "api_apply_discount",
        method: "POST",
        path: "/api/discount/apply",
      }),
    );
    expect(fs.existsSync(result.graphPath)).toBe(true);
    expect(fs.existsSync(result.coveragePath)).toBe(true);
  });

  it("marks unsupported dynamic fetch calls unresolved", () => {
    const unresolved = findUnsupportedFetches(
      "const url = `/api/${slug}`;\nfetch(url, { method: 'POST' });\n",
      "src/lib/apiClient.ts",
    );

    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toMatchObject({
      filePath: "src/lib/apiClient.ts",
      confidence: "unresolved",
    });
  });

  it("resolves flat endpoint constants used in fetch calls", () => {
    const source = [
      "const APPLY_DISCOUNT = '/api/discount/apply';",
      "fetch(APPLY_DISCOUNT, { method: 'POST' });",
    ].join("\n");

    const analysis = findResolvableApiCallsites(source);

    expect(analysis.matches).toContainEqual(
      expect.objectContaining({
        url: "/api/discount/apply",
        method: "POST",
        confidence: "medium",
        confidenceBasis: "endpoint_constant_literal",
      }),
    );
  });

  it("resolves simple local fetcher wrapper literals without unresolved wrapper noise", () => {
    const source = [
      "const fetcher = (url: string) => fetch(url).then((res) => res.json());",
      "useSWR<User>('/api/user', fetcher);",
      "fetcher('/api/team');",
    ].join("\n");

    const analysis = findResolvableApiCallsites(source);
    const unresolved = findUnsupportedFetches(
      source,
      "app/dashboard/page.tsx",
      analysis.ignoredFetchIndexes,
    );

    expect(analysis.matches).toEqual([
      expect.objectContaining({
        url: "/api/team",
        method: "GET",
        confidenceBasis: "local_fetch_wrapper_literal",
      }),
      expect.objectContaining({
        url: "/api/user",
        method: "GET",
        confidenceBasis: "swr_fetcher_literal",
      }),
    ]);
    expect(unresolved).toEqual([]);
  });
});
