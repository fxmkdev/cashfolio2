import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { buildRuntimeGraph, findRuntimeCycles } from "./runtime-cycles";

function graph(sources: Record<string, string>, sourceRoot = "/app/src") {
  const files = new Map(
    Object.entries(sources).map(([file, text]) => [
      resolve(sourceRoot, file),
      text,
    ]),
  );
  return buildRuntimeGraph(
    [...files.keys()],
    {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      paths: { "@/*": [`${sourceRoot}/*`] },
    },
    sourceRoot,
    {
      getCurrentDirectory: () => "/app",
      fileExists: (file) => files.has(file),
      readFile: (file) => files.get(file),
      directoryExists: (directory) =>
        [...files.keys()].some((file) => file.startsWith(directory + "/")),
    },
  );
}

describe("runtime cycle detection", () => {
  it.each([
    ["direct", 'import { b } from "./b";'],
    ["alias", 'import { b } from "@/b";'],
    ["normalized relative", 'import { b } from "./nested/../b";'],
    ["extension substitution", 'import { b } from "./b.js";'],
    ["re-export", 'export { b } from "./b";'],
    ["export all", 'export * from "./b";'],
    ["namespace export", 'export * as b from "./b";'],
    ["side effect", 'import "./b";'],
    ["require", 'const b = require("./b");'],
    ["import equals", 'import b = require("./b");'],
  ])("detects a %s cycle", (_, code) => {
    const cycles = findRuntimeCycles(
      graph({ "a.ts": code, "b.ts": 'import { a } from "./a";' }),
    );
    expect(cycles).toEqual([
      ["/app/src/a.ts", "/app/src/b.ts", "/app/src/a.ts"],
    ]);
  });
  it("detects indirect and independent cycles, including self imports", () => {
    expect(
      findRuntimeCycles(
        graph({
          "a.ts": 'export * from "./b";',
          "b.ts": 'export * from "./c";',
          "c.ts": 'export * from "./a";',
          "self.ts": 'import "./self";',
        }),
      ),
    ).toEqual([
      ["/app/src/a.ts", "/app/src/b.ts", "/app/src/c.ts", "/app/src/a.ts"],
      ["/app/src/self.ts", "/app/src/self.ts"],
    ]);
  });
  it.each([
    'import type { B } from "./b";',
    'import { type B } from "./b";',
    'export type { B } from "./b";',
    'export { type B } from "./b";',
    'export type * from "./b";',
    'type B = import("./b").B;',
    'import type B = require("./b");',
    'void import("./b");',
  ])("ignores erased or lazy dependencies: %s", (code) => {
    const runtime = graph({ "a.ts": code, "b.ts": 'import "./a";' });
    expect(runtime.get("/app/src/a.ts")).toEqual([]);
    expect(findRuntimeCycles(runtime)).toEqual([]);
  });
  it("retains mixed type/value imports and exports", () => {
    expect(
      findRuntimeCycles(
        graph({
          "a.ts": 'import { type B, b } from "./b";',
          "b.ts": 'export { type A, a } from "./a";',
        }),
      ),
    ).toHaveLength(1);
  });
  it("resolves directory entry points", () => {
    expect(
      findRuntimeCycles(
        graph({ "a.ts": 'import "./b";', "b/index.ts": 'import "../a";' }),
      ),
    ).toHaveLength(1);
  });
  it.each([
    "a.test.ts",
    "a.integration.ts",
    "a.stories.tsx",
    "a.story-harness.tsx",
    "testing/a.ts",
    "test-support/a.ts",
    "routeTree.gen.ts",
    ".prisma-client/client.ts",
  ])("excludes %s", (file) => {
    const runtime = graph({
      "entry.ts": `import "./${file}";`,
      [file]: 'import "./entry";',
    });
    expect(runtime.has(resolve("/app/src", file))).toBe(false);
    expect(findRuntimeCycles(runtime)).toEqual([]);
  });
  it("permits acyclic local modules and external packages", () => {
    expect(
      findRuntimeCycles(
        graph({
          "a.ts": 'import "react"; import "./b";',
          "b.ts": "export const b = 1;",
        }),
      ),
    ).toEqual([]);
  });
  it.each(["stories", ".prisma-client"])(
    "checks production cycles under a %s checkout ancestor",
    (ancestor) => {
      const runtime = graph(
        {
          "a.ts": 'import "@/b";',
          "b.ts": 'import "./a";',
          "stories/fixture.ts": 'import "../a";',
        },
        `/work/${ancestor}/cashfolio/src`,
      );
      expect(runtime.size).toBe(2);
      expect(findRuntimeCycles(runtime)).toHaveLength(1);
    },
  );
});
