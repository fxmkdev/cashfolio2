import { dirname, resolve, sep } from "node:path";
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

type Options = [{ sourceRoot: string }];
type MessageIds = "uiDependency" | "serverDependency";

const noUiDependencies: TSESLint.RuleModule<MessageIds, Options> = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Keep shared modules independent of server implementations and shared/server modules independent of UI implementations",
    },
    schema: [
      {
        type: "object",
        properties: { sourceRoot: { type: "string" } },
        required: ["sourceRoot"],
        additionalProperties: false,
      },
    ],
    messages: {
      uiDependency:
        "Shared and server modules must not depend on components or routes. Move reusable contracts and logic into shared modules.",
      serverDependency:
        "Shared modules must not depend on server modules, including their types. Move reusable contracts and logic into shared modules.",
    },
  },
  create(context) {
    const sourceRoot = context.options[0].sourceRoot;
    const forbiddenRoots = ["components", "routes"].map((directory) =>
      resolve(sourceRoot, directory),
    );
    const sharedRoot = resolve(sourceRoot, "shared");
    const serverRoot = resolve(sourceRoot, "server");
    const filename = resolve(context.filename);
    const isSharedModule = filename.startsWith(`${sharedRoot}${sep}`);

    function checkSource(source: TSESTree.Node | null | undefined): void {
      if (source?.type === "TSLiteralType") source = source.literal;
      if (source?.type !== "Literal" || typeof source.value !== "string")
        return;

      const specifier = source.value;
      let target: string;
      if (specifier.startsWith("@/")) {
        target = resolve(sourceRoot, specifier.slice(2));
      } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
        target = resolve(dirname(context.filename), specifier);
      } else {
        return;
      }

      if (
        forbiddenRoots.some(
          (root) => target === root || target.startsWith(`${root}${sep}`),
        )
      ) {
        context.report({ node: source, messageId: "uiDependency" });
      }
      if (
        isSharedModule &&
        (target === serverRoot || target.startsWith(`${serverRoot}${sep}`))
      ) {
        context.report({ node: source, messageId: "serverDependency" });
      }
    }

    return {
      ImportDeclaration: (node) => checkSource(node.source),
      ExportNamedDeclaration: (node) => checkSource(node.source),
      ExportAllDeclaration: (node) => checkSource(node.source),
      ImportExpression: (node) => checkSource(node.source),
      TSImportType: (node) => checkSource(node.source),
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require"
        ) {
          checkSource(node.arguments[0]);
        }
      },
    };
  },
};

export default noUiDependencies;
