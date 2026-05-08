import { promises as fs } from "node:fs";
import path from "node:path";
import {
  addEdge,
  fileNodeId,
  makeEdge,
  toRepoRelativePath,
} from "../graph/capabilityGraph";
import { CapabilityGraph } from "../graph/types";
import { lineForIndex, lineQuote, pathExists } from "./fileUtils";
import { ScannerCoverage } from "./types";
import { ViteRouteScanResult } from "./viteReactRouterRouteScanner";

/**
 * For each Vite route, build `route -> consumes -> api` edges by
 * traversing the import graph starting from the route's component file.
 *
 * Without these edges, a PR that changes `src/pages/DeckListPage.tsx`
 * would only be flagged at file/module level, even though the page
 * transitively calls `api_decks_v1_authoring`. This makes ReleaseGuard
 * actually useful on SPA projects.
 *
 * The traversal is bounded:
 *   - only follows local imports (./X, ../X)
 *   - skips node_modules, npm packages, and unresolved aliases
 *   - de-duplicates files; cycles are safe
 *   - depth-limited to avoid pathological cases
 */
export async function buildViteRouteToApiEdges(args: {
  rootDir: string;
  appRoot: string;
  routes: ViteRouteScanResult[];
  graph: CapabilityGraph;
  coverage: ScannerCoverage;
}): Promise<void> {
  const { rootDir, routes, graph, coverage } = args;
  if (routes.length === 0) return;

  // Build a lookup: filePath -> set of api node IDs the file defines.
  const fileToApis = new Map<string, Set<string>>();
  for (const edge of Object.values(graph.edges)) {
    if (edge.type !== "defines") continue;
    const sourceNode = graph.nodes[edge.source];
    const targetNode = graph.nodes[edge.target];
    if (!sourceNode || !targetNode) continue;
    if (sourceNode.type !== "file") continue;
    if (targetNode.type !== "api") continue;
    if (!sourceNode.filePath) continue;
    let set = fileToApis.get(sourceNode.filePath);
    if (!set) {
      set = new Set<string>();
      fileToApis.set(sourceNode.filePath, set);
    }
    set.add(edge.target);
  }
  if (fileToApis.size === 0) return;

  // Group routes by their declaration file so we parse each routes file
  // once.
  const byFile = new Map<string, ViteRouteScanResult[]>();
  for (const route of routes) {
    const list = byFile.get(route.absolutePath) ?? [];
    list.push(route);
    byFile.set(route.absolutePath, list);
  }

  for (const [routeFilePath, routesInFile] of byFile.entries()) {
    const routesSource = await safeReadFile(routeFilePath);
    if (!routesSource) continue;

    // 1. Extract path -> componentName for each route in this file.
    const bindings = findRouteElementBindings(routesSource);
    if (bindings.length === 0) continue;

    // 2. Build a map of identifiers -> their import specifier in this
    //    routes file, so we know where each component lives.
    const identifierToSpecifier = parseImportBindings(routesSource);

    for (const route of routesInFile) {
      const binding = bindings.find((b) => b.path === route.routePath);
      if (!binding) continue;
      const specifier = identifierToSpecifier.get(binding.componentName);
      if (!specifier) continue;
      if (!isLocalSpecifier(specifier)) continue;

      const resolvedComponentPath = await resolveLocalImport(
        path.dirname(routeFilePath),
        specifier,
      );
      if (!resolvedComponentPath) continue;

      // 3. Walk local imports starting from the page component file.
      const reachableFiles = await collectLocalImports({
        startFile: resolvedComponentPath,
        maxDepth: 8,
      });

      // 4. Find all api nodes defined in any reachable file.
      const reachedApis = new Set<string>();
      for (const absoluteFile of reachableFiles) {
        const relPath = toRepoRelativePath(rootDir, absoluteFile);
        const apis = fileToApis.get(relPath);
        if (!apis) continue;
        for (const apiId of apis) {
          reachedApis.add(apiId);
        }
      }

      if (reachedApis.size === 0) continue;

      // 5. Emit `route -> consumes -> api` edges.
      for (const apiId of reachedApis) {
        const targetNode = graph.nodes[apiId];
        if (!targetNode) continue;
        const apiTarget = targetNode.target ?? targetNode.name;
        const lineForBinding = lineForIndex(routesSource, binding.index);
        const edge = makeEdge(
          route.routeNode.id,
          "consumes",
          apiId,
          "medium",
          "vite_route_import_graph",
          [
            {
              filePath: route.relativePath,
              lineStart: lineForBinding,
              lineEnd: lineForBinding,
              quote: lineQuote(routesSource, lineForBinding),
              reason: `Route component ${binding.componentName} transitively imports a file that calls ${apiTarget}.`,
            },
          ],
          {
            method: targetNode.metadata?.outbound ? "outbound" : undefined,
          },
        );
        addEdge(graph, edge);
        coverage.resolvedCallsites.push({
          filePath: route.relativePath,
          line: lineForBinding,
          routeId: route.routeNode.id,
          apiId,
          method: typeof targetNode.metadata?.method === "string"
            ? (targetNode.metadata.method as string)
            : "GET",
          path: typeof targetNode.metadata?.path === "string"
            ? (targetNode.metadata.path as string)
            : (apiTarget ?? ""),
          confidence: "medium",
          confidenceBasis: "vite_route_import_graph",
        });
      }

      // Also bind the route to the page file so file-level changes to the
      // page component still mark the route as affected (in addition to
      // the existing route file binding).
      const fileNodeIdForComponent = fileNodeId(
        toRepoRelativePath(rootDir, resolvedComponentPath),
      );
      if (graph.nodes[fileNodeIdForComponent]) {
        const componentLine = 1;
        const componentEdge = makeEdge(
          fileNodeIdForComponent,
          "defines",
          route.routeNode.id,
          "medium",
          "vite_route_component_binding",
          [
            {
              filePath: toRepoRelativePath(rootDir, resolvedComponentPath),
              lineStart: componentLine,
              lineEnd: componentLine,
              quote: "page component",
              reason: `${binding.componentName} is the React Router element for ${route.routePath}.`,
            },
          ],
          {},
        );
        addEdge(graph, componentEdge);
      }
    }
  }
}

type RouteElementBinding = {
  path: string;
  componentName: string;
  index: number;
};

/**
 * Find route declarations in source that have both a `path` and an
 * `element={<Component />}` (or `element: <Component />` in object form).
 *
 * Supported forms:
 *   <Route path="/foo" element={<Bar />} />
 *   <Route element={<Bar />} path="/foo" />
 *   { path: "/foo", element: <Bar /> }
 *
 * Limitations:
 *   - element wrappers like `withAuth(<Bar />)` are not unwrapped
 *   - dotted components like `<Layout.Bar />` are not extracted
 *   - lazy/loadable patterns (`element={lazy(() => import("./Bar"))}`) skip
 */
export function findRouteElementBindings(source: string): RouteElementBinding[] {
  const bindings: RouteElementBinding[] = [];

  // 1. JSX <Route ... />: walk character-by-character respecting
  //    {...} and "..." / '...' nesting so that JSX inside
  //    `element={<X />}` doesn't accidentally terminate the Route tag.
  const startRegex = /<Route\b/g;
  let match: RegExpExecArray | null;
  while ((match = startRegex.exec(source))) {
    const tagInnerStart = match.index + match[0].length;
    const tagInnerEnd = findJsxTagInnerEnd(source, tagInnerStart);
    if (tagInnerEnd === -1) continue;
    const attrText = source.slice(tagInnerStart, tagInnerEnd);
    const pathMatch = /\bpath\s*=\s*(["'])([^"']*)\1/.exec(attrText);
    const elementMatch = /\belement\s*=\s*\{[\s\S]*?<([A-Z][\w$]*)/.exec(
      attrText,
    );
    if (!pathMatch || !elementMatch) continue;
    bindings.push({
      path: normalizeRoutePath(pathMatch[2]),
      componentName: elementMatch[1],
      index: match.index,
    });
  }

  // 2. Object form `{ path: "...", element: <X /> }` — find the enclosing
  //    object literal for each `path: "..."` and look for `element:` only
  //    within that object. This avoids matching `element:` from a
  //    sibling object.
  const objectPathRegex = /(?<!\w)path\s*:\s*(["'])([^"']*)\1/g;
  while ((match = objectPathRegex.exec(source))) {
    const pathValue = match[2];
    const enclosing = findEnclosingObject(source, match.index);
    if (!enclosing) continue;
    const objText = source.slice(enclosing.start, enclosing.end);
    const elementMatch = /(?<!\w)element\s*:\s*<([A-Z][\w$]*)/.exec(objText);
    if (!elementMatch) continue;
    bindings.push({
      path: normalizeRoutePath(pathValue),
      componentName: elementMatch[1],
      index: match.index,
    });
  }

  return dedupeBindings(bindings);
}

/**
 * Walk forward from inside an opening JSX tag until we find the `>` that
 * closes it, ignoring any `>` characters that appear inside `{...}`
 * expressions or string literals. Returns the index of the closing `>`
 * (which may also be a `/` if self-closing — we accept both).
 */
function findJsxTagInnerEnd(source: string, start: number): number {
  let depth = 0; // depth inside { ... }
  let inSingle = false;
  let inDouble = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inSingle) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === "{") { depth += 1; continue; }
    if (ch === "}") { depth -= 1; continue; }
    if (ch === ">" && depth === 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Given a position inside the source, find the bounds of the smallest
 * enclosing `{...}` block. Returns undefined if no enclosing block.
 *
 * String content inside the source is not parsed away — we accept the
 * limitation that brace literals in strings could confuse this. For
 * route-object scanning that's almost never an issue because route
 * objects are JS literals, not string-embedded JSON.
 */
function findEnclosingObject(
  source: string,
  position: number,
): { start: number; end: number } | undefined {
  let depth = 0;
  let start = -1;
  for (let i = position - 1; i >= 0; i -= 1) {
    const ch = source[i];
    if (ch === "}") {
      depth += 1;
    } else if (ch === "{") {
      if (depth === 0) {
        start = i;
        break;
      }
      depth -= 1;
    }
  }
  if (start === -1) return undefined;
  depth = 1;
  for (let i = start + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return { start, end: i + 1 };
      }
    }
  }
  return undefined;
}

function dedupeBindings(bindings: RouteElementBinding[]): RouteElementBinding[] {
  const seen = new Set<string>();
  const out: RouteElementBinding[] = [];
  for (const b of bindings) {
    const key = `${b.path}|${b.componentName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

function normalizeRoutePath(value: string): string {
  if (!value) return "/";
  if (value === "*") return "/*";
  if (value.startsWith("/")) return value;
  return `/${value}`;
}

/**
 * Parse all import declarations in the source and return a mapping
 * from local identifier to the import specifier string.
 *
 * Supported:
 *   import X from "specifier"           -> X = specifier
 *   import { X, Y as Z } from "spec"    -> X = spec, Z = spec
 *   import * as Ns from "spec"          -> Ns = spec
 *   import "side-effect"                -> nothing recorded
 *
 * Default and named on the same line:
 *   import X, { Y } from "spec"         -> X = spec, Y = spec
 */
export function parseImportBindings(source: string): Map<string, string> {
  const map = new Map<string, string>();
  const importRegex =
    /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+(["'])([^"']+)\2/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source))) {
    const clause = match[1].trim();
    const specifier = match[3];

    // Split "X, { Y, Z as W }" or "* as Ns"
    let remaining = clause;

    // 1. Default import (first identifier before , or {)
    const defaultMatch = /^([A-Za-z_$][\w$]*)/.exec(remaining);
    if (defaultMatch && !remaining.startsWith("{") && !remaining.startsWith("*")) {
      map.set(defaultMatch[1], specifier);
      remaining = remaining.slice(defaultMatch[0].length).trim();
      if (remaining.startsWith(",")) remaining = remaining.slice(1).trim();
    }

    // 2. Namespace import: * as Ns
    const namespaceMatch = /^\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(remaining);
    if (namespaceMatch) {
      map.set(namespaceMatch[1], specifier);
      remaining = remaining.slice(namespaceMatch[0].length).trim();
      if (remaining.startsWith(",")) remaining = remaining.slice(1).trim();
    }

    // 3. Named imports: { X, Y as Z }
    const namedBlock = /^\{([\s\S]*?)\}/.exec(remaining);
    if (namedBlock) {
      const inside = namedBlock[1];
      for (const entry of inside.split(",")) {
        const trimmed = entry.trim().replace(/^type\s+/, "");
        if (!trimmed) continue;
        const aliasMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(trimmed);
        if (aliasMatch) {
          map.set(aliasMatch[2], specifier);
          continue;
        }
        const plain = /^([A-Za-z_$][\w$]*)$/.exec(trimmed);
        if (plain) {
          map.set(plain[1], specifier);
        }
      }
    }
  }
  return map;
}

function isLocalSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
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
    `${base}.jsx`,
    `${base}.js`,
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
    path.join(base, "index.jsx"),
    path.join(base, "index.js"),
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      const stat = await safeStat(candidate);
      if (stat?.isFile()) return candidate;
    }
  }
  return undefined;
}

async function collectLocalImports(args: {
  startFile: string;
  maxDepth: number;
}): Promise<Set<string>> {
  const visited = new Set<string>();
  await walk(args.startFile, 0);
  return visited;

  async function walk(absoluteFile: string, depth: number): Promise<void> {
    if (visited.has(absoluteFile)) return;
    if (depth > args.maxDepth) return;
    visited.add(absoluteFile);
    const source = await safeReadFile(absoluteFile);
    if (!source) return;
    const importRegex = /import\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    const baseDir = path.dirname(absoluteFile);
    while ((m = importRegex.exec(source))) {
      const specifier = m[1];
      if (!isLocalSpecifier(specifier)) continue;
      const resolved = await resolveLocalImport(baseDir, specifier);
      if (!resolved) continue;
      await walk(resolved, depth + 1);
    }
  }
}

async function safeReadFile(absolutePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    return undefined;
  }
}

async function safeStat(absolutePath: string) {
  try {
    return await fs.stat(absolutePath);
  } catch {
    return undefined;
  }
}
