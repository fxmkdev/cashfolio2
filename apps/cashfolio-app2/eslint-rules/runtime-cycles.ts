import { resolve } from "node:path";
import ts from "typescript";
import { isTestSupport } from "./import-paths.ts";

export type RuntimeGraph = ReadonlyMap<string, readonly string[]>;

export function isProductionSource(filename: string): boolean {
  return (
    !isTestSupport(filename) &&
    !filename.endsWith(".d.ts") &&
    !filename.endsWith("/routeTree.gen.ts") &&
    !filename.includes("/.prisma-client/")
  );
}

/** Only eager runtime edges participate; erased types and lazy imports do not. */
export function runtimeSpecifiers(source: ts.SourceFile): string[] {
  const dependencies: string[] = [];
  function add(node: ts.Node | undefined) {
    if (node && ts.isStringLiteralLike(node)) dependencies.push(node.text);
  }
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (!clause) add(node.moduleSpecifier);
      else if (!clause.isTypeOnly) {
        const bindings = clause.namedBindings;
        if (
          clause.name ||
          !bindings ||
          ts.isNamespaceImport(bindings) ||
          bindings.elements.length === 0 ||
          bindings.elements.some((e) => !e.isTypeOnly)
        )
          add(node.moduleSpecifier);
      }
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly) {
      const clause = node.exportClause;
      if (
        !clause ||
        ts.isNamespaceExport(clause) ||
        clause.elements.some((e) => !e.isTypeOnly)
      )
        add(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require"
    ) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return dependencies;
}

export function buildRuntimeGraph(
  filenames: readonly string[],
  options: ts.CompilerOptions,
  host: ts.ModuleResolutionHost = ts.sys,
): RuntimeGraph {
  const files = new Set(
    filenames.map((f) => resolve(f)).filter(isProductionSource),
  );
  const graph = new Map<string, string[]>();
  const cache = ts.createModuleResolutionCache(
    process.cwd(),
    (f) => f,
    options,
  );
  for (const filename of files) {
    const text = host.readFile?.(filename);
    if (text == null)
      throw new Error(`Cannot read runtime module: ${filename}`);
    const source = ts.createSourceFile(
      filename,
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const edges = new Set<string>();
    for (const specifier of runtimeSpecifiers(source)) {
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
      const result = ts.resolveModuleName(
        specifier,
        filename,
        options,
        host,
        cache,
      ).resolvedModule;
      if (result && files.has(resolve(result.resolvedFileName)))
        edges.add(resolve(result.resolvedFileName));
    }
    graph.set(filename, [...edges].sort());
  }
  return graph;
}

/** Report a concrete cycle path for each strongly connected component. */
export function findRuntimeCycles(graph: RuntimeGraph): string[][] {
  const indices = new Map<string, number>();
  const lows = new Map<string, number>();
  const stack: string[] = [];
  const active = new Set<string>();
  const cycles: string[][] = [];
  function cyclePath(members: Set<string>): string[] {
    const path: string[] = [];
    const positions = new Map<string, number>();
    let current = [...members].sort()[0];
    while (!positions.has(current)) {
      positions.set(current, path.length);
      path.push(current);
      current = graph.get(current)!.find((next) => members.has(next))!;
    }
    return [...path.slice(positions.get(current)), current];
  }
  function visit(file: string) {
    indices.set(file, indices.size);
    lows.set(file, indices.get(file)!);
    stack.push(file);
    active.add(file);
    for (const target of graph.get(file) ?? []) {
      if (!indices.has(target)) {
        visit(target);
        lows.set(file, Math.min(lows.get(file)!, lows.get(target)!));
      } else if (active.has(target))
        lows.set(file, Math.min(lows.get(file)!, indices.get(target)!));
    }
    if (lows.get(file) !== indices.get(file)) return;
    const members = new Set<string>();
    let target: string;
    do {
      target = stack.pop()!;
      active.delete(target);
      members.add(target);
    } while (target !== file);
    if (members.size > 1 || graph.get(file)?.includes(file))
      cycles.push(cyclePath(members));
  }
  for (const file of [...graph.keys()].sort())
    if (!indices.has(file)) visit(file);
  return cycles;
}
