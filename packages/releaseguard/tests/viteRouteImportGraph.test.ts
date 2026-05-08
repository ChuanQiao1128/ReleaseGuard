import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findRouteElementBindings,
  parseImportBindings,
} from "../src/scanner/viteRouteImportGraph";
import { scanRepository } from "../src/scanner/repoScanner";

describe("findRouteElementBindings", () => {
  it("extracts JSX route bindings (path-first attribute order)", () => {
    const source = `
      <Route path="/decks" element={<DeckListPage />} />
      <Route path="/decks/edit" element={<DeckEditPage />} />
    `;
    const bindings = findRouteElementBindings(source);
    expect(bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/decks", componentName: "DeckListPage" }),
        expect.objectContaining({ path: "/decks/edit", componentName: "DeckEditPage" }),
      ]),
    );
  });

  it("extracts JSX route bindings (element-first attribute order)", () => {
    const source = `
      <Route element={<Home />} path="/" />
    `;
    const bindings = findRouteElementBindings(source);
    expect(bindings).toContainEqual(
      expect.objectContaining({ path: "/", componentName: "Home" }),
    );
  });

  it("extracts object form route bindings", () => {
    const source = `
      const router = createBrowserRouter([
        { path: "/login", element: <LoginPage /> },
        { path: "/admin/users", element: <AdminUsersPage /> },
      ]);
    `;
    const bindings = findRouteElementBindings(source);
    const paths = bindings.map((b) => `${b.path}->${b.componentName}`).sort();
    expect(paths).toContain("/login->LoginPage");
    expect(paths).toContain("/admin/users->AdminUsersPage");
  });

  it("ignores routes whose element is a non-component identifier", () => {
    // lowercase identifiers are not React components
    const source = `<Route path="/x" element={<div />} />`;
    expect(findRouteElementBindings(source)).toEqual([]);
  });

  it("dedupes bindings by path+component", () => {
    const source = `
      <Route path="/a" element={<A />} />
      <Route path="/a" element={<A />} />
    `;
    expect(findRouteElementBindings(source)).toHaveLength(1);
  });
});

describe("parseImportBindings", () => {
  it("parses default import", () => {
    const map = parseImportBindings(`import App from "./App";`);
    expect(map.get("App")).toBe("./App");
  });

  it("parses named imports", () => {
    const map = parseImportBindings(
      `import { A, B as C } from "./pages";`,
    );
    expect(map.get("A")).toBe("./pages");
    expect(map.get("C")).toBe("./pages");
    expect(map.has("B")).toBe(false); // B is renamed to C
  });

  it("parses default + named together", () => {
    const map = parseImportBindings(
      `import React, { useState } from "react";`,
    );
    expect(map.get("React")).toBe("react");
    expect(map.get("useState")).toBe("react");
  });

  it("parses namespace import", () => {
    const map = parseImportBindings(
      `import * as Routes from "./routes";`,
    );
    expect(map.get("Routes")).toBe("./routes");
  });

  it("ignores side-effect imports", () => {
    const map = parseImportBindings(`import "./styles.css";`);
    expect(map.size).toBe(0);
  });

  it("strips type-only modifier from named entries", () => {
    const map = parseImportBindings(
      `import { type Foo, Bar } from "./types";`,
    );
    expect(map.get("Foo")).toBe("./types");
    expect(map.get("Bar")).toBe("./types");
  });
});

describe("End-to-end: route -> api edges via import graph", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "releaseguard-route-graph-"));

    await fs.writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        name: "fixture",
        type: "module",
        dependencies: {
          axios: "^1.13.0",
          react: "^19.0.0",
          "react-dom": "^19.0.0",
          "react-router-dom": "^7.0.0",
        },
        devDependencies: {
          vite: "^7.0.0",
          typescript: "^5.0.0",
        },
      }),
    );
    await fs.writeFile(path.join(tmpDir, "tsconfig.json"), "{}");

    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
    await fs.mkdir(path.join(tmpDir, "src", "pages"), { recursive: true });
    await fs.mkdir(path.join(tmpDir, "src", "api"), { recursive: true });

    // Wrapped axios client
    await fs.writeFile(
      path.join(tmpDir, "src", "api", "http.ts"),
      `
import axios from "axios";
export const http = axios.create({ baseURL: "/api" });
      `.trim(),
    );

    // Authoring API wrapper file (defines outbound APIs).
    // NOTE: GET and POST must use *distinct paths* because the current
    // apiNodeId() function does not include HTTP method, so two
    // callsites with the same path but different methods collapse into
    // the same node. Including this comment because that's a real
    // pre-existing limitation, not something the fixture should hide.
    await fs.writeFile(
      path.join(tmpDir, "src", "api", "authoring.ts"),
      `
import { http } from "./http";
export async function loadDecks() {
  return http.get("/api/v1/authoring/decks");
}
export async function publishDeck(body: unknown) {
  return http.post("/api/v1/authoring/publish", body);
}
      `.trim(),
    );

    // Page component that uses the API wrapper (transitive)
    await fs.writeFile(
      path.join(tmpDir, "src", "pages", "DeckListPage.tsx"),
      `
import { loadDecks, publishDeck } from "../api/authoring";
export function DeckListPage() {
  loadDecks();
  publishDeck({});
  return <div>decks</div>;
}
      `.trim(),
    );

    // App.tsx with React Router routes
    await fs.writeFile(
      path.join(tmpDir, "src", "App.tsx"),
      `
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DeckListPage } from "./pages/DeckListPage";
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/decks" element={<DeckListPage />} />
      </Routes>
    </BrowserRouter>
  );
}
      `.trim(),
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("builds route -> consumes -> api edges via transitive imports", async () => {
    const { graph } = await scanRepository(tmpDir);

    const routeNode = Object.values(graph.nodes).find(
      (n) => n.type === "route" && n.target === "/decks",
    );
    expect(routeNode).toBeDefined();

    const apiNodes = Object.values(graph.nodes).filter((n) => n.type === "api");
    expect(apiNodes.length).toBeGreaterThanOrEqual(2);

    // The route should now have `consumes` edges to BOTH the GET and POST APIs
    // (transitively, because DeckListPage -> authoring.ts which defines both).
    const consumesEdges = Object.values(graph.edges).filter(
      (e) =>
        e.type === "consumes" &&
        e.source === routeNode!.id &&
        e.confidenceBasis === "vite_route_import_graph",
    );

    expect(consumesEdges.length).toBeGreaterThanOrEqual(2);

    const consumedTargets = consumesEdges
      .map((e) => graph.nodes[e.target]?.target)
      .sort();
    expect(consumedTargets).toContain("GET /api/v1/authoring/decks");
    expect(consumedTargets).toContain("POST /api/v1/authoring/publish");
  });

  it("binds the page component file to its route via a defines edge", async () => {
    const { graph } = await scanRepository(tmpDir);

    const routeNode = Object.values(graph.nodes).find(
      (n) => n.type === "route" && n.target === "/decks",
    );
    expect(routeNode).toBeDefined();

    // There should be a `defines` edge from src/pages/DeckListPage.tsx file
    // node to the route, with the route_component_binding basis.
    const componentBinding = Object.values(graph.edges).find(
      (e) =>
        e.type === "defines" &&
        e.target === routeNode!.id &&
        e.confidenceBasis === "vite_route_component_binding",
    );

    expect(componentBinding).toBeDefined();
  });
});
