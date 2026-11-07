import { basename, dirname, relative, resolve, sep } from "node:path";
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

export function isWithin(filename: string, directory: string): boolean {
  return filename === directory || filename.startsWith(`${directory}${sep}`);
}

export function localImportTarget(
  sourceRoot: string,
  filename: string,
  specifier: string,
): string | undefined {
  if (specifier.startsWith("@/"))
    return resolve(sourceRoot, specifier.slice(2));
  if (specifier.startsWith("./") || specifier.startsWith("../"))
    return resolve(dirname(filename), specifier);
}

/** Support is identified by deliberate directory/file naming, never by importers. */
export function isTestSupport(filename: string): boolean {
  const path = filename.split(sep).join("/");
  const name = basename(filename);
  return (
    /\/(?:testing|stories|fixtures|__tests__|__mocks__|__fixtures__|(?:test|story|storybook)-(?:support|fixtures|helpers|utils))(?:\/|$)/.test(
      path,
    ) ||
    /(?:^|[.-])(?:test|integration|stories)(?:[.-]|$)/.test(name) ||
    /(?:^|[.-])(?:story|storybook)[.-]/.test(name)
  );
}

export function routePrivateOwner(
  sourceRoot: string,
  target: string,
): string | undefined {
  const routes = resolve(sourceRoot, "routes");
  if (!isWithin(target, routes)) return;
  const parts = relative(routes, target).split(sep);
  const privateIndex = parts.findIndex((part) => part.startsWith("-"));
  if (privateIndex !== -1)
    return resolve(routes, ...parts.slice(0, privateIndex));
}

/** Visit literal dependencies, including those erased by the TS compiler. */
export function dependencyVisitors(
  check: (specifier: string, node: TSESTree.Node) => void,
): TSESLint.RuleListener {
  function source(node: TSESTree.Node | null | undefined) {
    if (node?.type === "TSLiteralType") node = node.literal;
    if (node?.type === "Literal" && typeof node.value === "string")
      check(node.value, node);
    if (node?.type === "TemplateLiteral" && node.expressions.length === 0)
      check(node.quasis[0].value.cooked ?? node.quasis[0].value.raw, node);
  }
  return {
    ImportDeclaration: (node) => source(node.source),
    ExportNamedDeclaration: (node) => source(node.source),
    ExportAllDeclaration: (node) => source(node.source),
    ImportExpression: (node) => source(node.source),
    TSImportType: (node) => source(node.source),
    TSExternalModuleReference: (node) => source(node.expression),
    CallExpression(node) {
      if (node.callee.type === "Identifier" && node.callee.name === "require")
        source(node.arguments[0]);
    },
  };
}
