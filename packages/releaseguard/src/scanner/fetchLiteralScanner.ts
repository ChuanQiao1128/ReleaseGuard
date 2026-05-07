import { promises as fs } from "node:fs";
import path from "node:path";
import {
  addEdge,
  addFileNode,
  makeEdge,
  toRepoRelativePath,
} from "../graph/capabilityGraph";
import { CapabilityGraph } from "../graph/types";
import { ApiScanResult } from "./nextApiScanner";
import { RouteScanResult } from "./nextRouteScanner";
import { lineForIndex, lineQuote, pathExists } from "./fileUtils";
import { ScannerCoverage, UnresolvedCallsite } from "./types";
import { classifyUnresolvedPattern } from "./unresolvedPatternClassifier";

type FetchLiteralMatch = {
  url: string;
  method: string;
  index: number;
  confidence: "high" | "medium";
  confidenceBasis: string;
};

type RouteContext = {
  route: RouteScanResult;
  files: Set<string>;
};

type FetchWrapperDefinition = {
  name: string;
  fetchIndex: number;
};

type FetchScanAnalysis = {
  matches: FetchLiteralMatch[];
  ignoredFetchIndexes: Set<number>;
};

export async function scanFetchLiterals(
  rootDir: string,
  graph: CapabilityGraph,
  routes: RouteScanResult[],
  apis: ApiScanResult[],
  coverage: ScannerCoverage,
): Promise<void> {
  const contexts = await buildRouteContexts(routes);
  const apiByTarget = new Map(
    apis.map((api) => [`${api.method} ${api.path}`, api] as const),
  );

  for (const context of contexts) {
    for (const absoluteFile of context.files) {
      const relativePath = toRepoRelativePath(rootDir, absoluteFile);
      addFileNode(graph, rootDir, absoluteFile, "frontend_file_scanned");
      const source = await fs.readFile(absoluteFile, "utf8");
      const analysis = findResolvableApiCallsites(source);

      for (const match of analysis.matches) {
        const api = apiByTarget.get(`${match.method} ${match.url}`);
        if (!api) {
          const unresolved: UnresolvedCallsite = {
            filePath: relativePath,
            line: lineForIndex(source, match.index),
            reason: `No scanned API matched ${match.method} ${match.url}.`,
            quote: lineQuote(source, lineForIndex(source, match.index)),
            confidence: "unresolved",
          };
          coverage.unresolvedCallsites.push({
            ...unresolved,
            pattern: classifyUnresolvedPattern(unresolved),
          });
          continue;
        }

        const line = lineForIndex(source, match.index);
        const edge = makeEdge(
          context.route.routeNode.id,
          "consumes",
          api.apiNode.id,
          match.confidence,
          match.confidenceBasis,
          [
            {
              filePath: relativePath,
              lineStart: line,
              lineEnd: line,
              quote: lineQuote(source, line),
              reason: `${match.confidenceBasis} connects route UI to API.`,
            },
          ],
          { method: match.method, path: match.url },
        );
        addEdge(graph, edge);
        coverage.resolvedCallsites.push({
          filePath: relativePath,
          line,
          routeId: context.route.routeNode.id,
          apiId: api.apiNode.id,
          method: match.method,
          path: match.url,
          confidence: match.confidence,
          confidenceBasis: match.confidenceBasis,
        });
      }

      for (const unresolved of findUnsupportedFetches(
        source,
        relativePath,
        analysis.ignoredFetchIndexes,
      )) {
        coverage.unresolvedCallsites.push(unresolved);
      }
    }
  }
}

export function findDirectFetchLiterals(source: string): FetchLiteralMatch[] {
  const matches: FetchLiteralMatch[] = [];
  const fetchLiteralRegex = /fetch\s*\(\s*(["'])(\/api\/[^"']+)\1/g;
  let match: RegExpExecArray | null;
  while ((match = fetchLiteralRegex.exec(source))) {
    const window = source.slice(match.index, match.index + 400);
    const methodMatch = /method\s*:\s*(["'])([A-Za-z]+)\1/.exec(window);
    matches.push({
      url: match[2],
      method: methodMatch?.[2]?.toUpperCase() ?? "GET",
      index: match.index,
      confidence: "high",
      confidenceBasis: "direct_fetch_literal",
    });
  }
  return matches;
}

export function findResolvableApiCallsites(source: string): FetchScanAnalysis {
  const matches: FetchLiteralMatch[] = [];
  const ignoredFetchIndexes = new Set<number>();
  const seen = new Set<string>();
  const endpointConstants = findEndpointConstants(source);
  const wrappers = findFetchWrapperDefinitions(source);
  const wrapperNames = new Set(wrappers.map((wrapper) => wrapper.name));

  for (const wrapper of wrappers) {
    ignoredFetchIndexes.add(wrapper.fetchIndex);
  }

  for (const match of findDirectFetchLiterals(source)) {
    addMatch(matches, seen, match);
    ignoredFetchIndexes.add(match.index);
  }

  for (const match of findFetchConstantCalls(source, endpointConstants)) {
    addMatch(matches, seen, match);
    ignoredFetchIndexes.add(match.index);
  }

  for (const match of findWrapperLiteralCalls(source, wrapperNames)) {
    addMatch(matches, seen, match);
  }

  for (const match of findWrapperConstantCalls(
    source,
    wrapperNames,
    endpointConstants,
  )) {
    addMatch(matches, seen, match);
  }

  return { matches, ignoredFetchIndexes };
}

function addMatch(
  matches: FetchLiteralMatch[],
  seen: Set<string>,
  match: FetchLiteralMatch,
): void {
  const key = `${match.index}:${match.method}:${match.url}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  matches.push(match);
}

function findEndpointConstants(source: string): Map<string, string> {
  const constants = new Map<string, string>();
  const constantRegex =
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(["'])(\/api\/[^"']+)\2/g;
  let match: RegExpExecArray | null;
  while ((match = constantRegex.exec(source))) {
    constants.set(match[1], match[3]);
  }
  return constants;
}

function findFetchConstantCalls(
  source: string,
  endpointConstants: Map<string, string>,
): FetchLiteralMatch[] {
  const matches: FetchLiteralMatch[] = [];
  const fetchIdentifierRegex = /fetch\s*\(\s*([A-Za-z_$][\w$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = fetchIdentifierRegex.exec(source))) {
    const url = endpointConstants.get(match[1]);
    if (!url) {
      continue;
    }
    const window = source.slice(match.index, match.index + 400);
    const methodMatch = /method\s*:\s*(["'])([A-Za-z]+)\1/.exec(window);
    matches.push({
      url,
      method: methodMatch?.[2]?.toUpperCase() ?? "GET",
      index: match.index,
      confidence: "medium",
      confidenceBasis: "endpoint_constant_literal",
    });
  }
  return matches;
}

function findFetchWrapperDefinitions(source: string): FetchWrapperDefinition[] {
  const wrappers: FetchWrapperDefinition[] = [];
  const arrowRegex =
    /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?\s*([A-Za-z_$][\w$]*)(?:\s*:[^)]+)?\s*\)?\s*=>\s*fetch\s*\(\s*\2/g;
  let match: RegExpExecArray | null;
  while ((match = arrowRegex.exec(source))) {
    const fetchIndex = match.index + match[0].lastIndexOf("fetch");
    if (fetchIndex >= 0) {
      wrappers.push({ name: match[1], fetchIndex });
    }
  }

  const functionRegex =
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)[^)]*\)\s*\{[\s\S]*?fetch\s*\(\s*\2/g;
  while ((match = functionRegex.exec(source))) {
    const fetchIndex = match.index + match[0].lastIndexOf("fetch");
    if (fetchIndex >= 0) {
      wrappers.push({ name: match[1], fetchIndex });
    }
  }

  return wrappers;
}

function findWrapperLiteralCalls(
  source: string,
  wrapperNames: Set<string>,
): FetchLiteralMatch[] {
  if (wrapperNames.size === 0) {
    return [];
  }
  const matches: FetchLiteralMatch[] = [];
  const wrapperPattern = [...wrapperNames].map(escapeRegExp).join("|");
  const wrapperCallRegex = new RegExp(
    `\\b(?:${wrapperPattern})\\s*\\(\\s*(["'])(\\/api\\/[^"']+)\\1`,
    "g",
  );
  let match: RegExpExecArray | null;
  while ((match = wrapperCallRegex.exec(source))) {
    matches.push({
      url: match[2],
      method: "GET",
      index: match.index,
      confidence: "medium",
      confidenceBasis: "local_fetch_wrapper_literal",
    });
  }

  const swrRegex = new RegExp(
    `\\buseSWR(?:Immutable)?(?:<[^>]+>)?\\s*\\(\\s*(["'])(\\/api\\/[^"']+)\\1\\s*,\\s*(${wrapperPattern})\\b`,
    "g",
  );
  while ((match = swrRegex.exec(source))) {
    matches.push({
      url: match[2],
      method: "GET",
      index: match.index,
      confidence: "medium",
      confidenceBasis: "swr_fetcher_literal",
    });
  }

  return matches;
}

function findWrapperConstantCalls(
  source: string,
  wrapperNames: Set<string>,
  endpointConstants: Map<string, string>,
): FetchLiteralMatch[] {
  if (wrapperNames.size === 0 || endpointConstants.size === 0) {
    return [];
  }
  const matches: FetchLiteralMatch[] = [];
  const wrapperPattern = [...wrapperNames].map(escapeRegExp).join("|");
  const constantPattern = [...endpointConstants.keys()].map(escapeRegExp).join("|");
  const wrapperCallRegex = new RegExp(
    `\\b(?:${wrapperPattern})\\s*\\(\\s*(${constantPattern})\\b`,
    "g",
  );
  let match: RegExpExecArray | null;
  while ((match = wrapperCallRegex.exec(source))) {
    const url = endpointConstants.get(match[1]);
    if (!url) {
      continue;
    }
    matches.push({
      url,
      method: "GET",
      index: match.index,
      confidence: "medium",
      confidenceBasis: "local_fetch_wrapper_endpoint_constant",
    });
  }

  const swrRegex = new RegExp(
    `\\buseSWR(?:Immutable)?(?:<[^>]+>)?\\s*\\(\\s*(${constantPattern})\\s*,\\s*(${wrapperPattern})\\b`,
    "g",
  );
  while ((match = swrRegex.exec(source))) {
    const url = endpointConstants.get(match[1]);
    if (!url) {
      continue;
    }
    matches.push({
      url,
      method: "GET",
      index: match.index,
      confidence: "medium",
      confidenceBasis: "swr_fetcher_endpoint_constant",
    });
  }

  return matches;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findUnsupportedFetches(
  source: string,
  filePath: string,
  resolvedIndexes: Set<number> = new Set(),
): UnresolvedCallsite[] {
  const unresolved: UnresolvedCallsite[] = [];
  const fetchRegex = /fetch\s*\(\s*([^,\)\n]+)/g;
  let match: RegExpExecArray | null;
  while ((match = fetchRegex.exec(source))) {
    if (resolvedIndexes.has(match.index)) {
      continue;
    }
    const firstArg = match[1].trim();
    if (/^["']\/api\/[^"']+["']$/.test(firstArg)) {
      continue;
    }
    const callsite: UnresolvedCallsite = {
      filePath,
      line: lineForIndex(source, match.index),
      reason:
        "Unsupported fetch call in v0.1. Only direct string literals like fetch(\"/api/...\") are resolved.",
      quote: lineQuote(source, lineForIndex(source, match.index)),
      confidence: "unresolved",
    };
    unresolved.push({
      ...callsite,
      pattern: classifyUnresolvedPattern(callsite),
    });
  }
  return unresolved;
}

async function buildRouteContexts(
  routes: RouteScanResult[],
): Promise<RouteContext[]> {
  const contexts: RouteContext[] = [];
  for (const route of routes) {
    const files = new Set<string>();
    await collectLocalImports(route.absolutePath, files);
    contexts.push({ route, files });
  }
  return contexts;
}

async function collectLocalImports(
  absoluteFile: string,
  files: Set<string>,
): Promise<void> {
  if (files.has(absoluteFile)) {
    return;
  }
  files.add(absoluteFile);
  const source = await fs.readFile(absoluteFile, "utf8");
  const importRegex = /import\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source))) {
    const specifier = match[1];
    if (!specifier.startsWith(".")) {
      continue;
    }
    const resolved = await resolveLocalImport(path.dirname(absoluteFile), specifier);
    if (resolved) {
      await collectLocalImports(resolved, files);
    }
  }
}

async function resolveLocalImport(
  baseDir: string,
  specifier: string,
): Promise<string | undefined> {
  const base = path.resolve(baseDir, specifier);
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}
