import { resolve } from "node:path";
import type { TSESLint } from "@typescript-eslint/utils";
import {
  dependencyVisitors,
  isTestSupport,
  isWithin,
  localImportTarget,
} from "./import-paths.ts";

type Options = [{ sourceRoot: string }];
type MessageIds = "uiDependency" | "serverDependency";

const noUiDependencies: TSESLint.RuleModule<MessageIds, Options> = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Keep shared contracts/logic and server code independent of UI implementations",
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
        "Shared and server modules must not depend on UI implementations. Put shared UI in components and reusable contracts/logic in shared.",
      serverDependency:
        "Shared modules must not depend on server implementations, including their types. Move reusable contracts and logic into shared modules.",
    },
  },
  create(context) {
    const { sourceRoot } = context.options[0];
    const filename = resolve(context.filename);
    if (isTestSupport(filename)) return {};
    const isShared = isWithin(filename, resolve(sourceRoot, "shared"));
    return dependencyVisitors((specifier, node) => {
      const target = localImportTarget(sourceRoot, filename, specifier);
      const uiPackage =
        /^(?:react(?:[-/]|$)|@mantine\/|@tabler\/|@tanstack\/react-(?:router|start)(?:\/|$)|ag-(?:charts|grid)(?:-|\/|$))/.test(
          specifier,
        );
      const uiTarget = target?.replace(/\.[cm]?[jt]sx?$/, "");
      const uiOwners = [
        "components",
        "routes",
        "hooks",
        "router",
        "client",
        "mantine",
        "theme",
        "user-locale-context",
        "classification-context",
        "ag-grid-modules",
        "ag-chart-modules",
      ];
      if (
        (isShared && uiPackage) ||
        (uiTarget &&
          uiOwners.some((root) =>
            isWithin(uiTarget, resolve(sourceRoot, root)),
          ))
      )
        context.report({ node, messageId: "uiDependency" });
      const serverPackage =
        /^(?:node:|redis(?:\/|$)|@prisma\/|@logto\/node(?:\/|$))/.test(
          specifier,
        );
      if (
        isShared &&
        (serverPackage ||
          (target &&
            (isWithin(target, resolve(sourceRoot, "server")) ||
              isWithin(target, resolve(sourceRoot, ".prisma-client/client")) ||
              /\.server(?:\.[cm]?[jt]sx?)?$/.test(target))))
      )
        context.report({ node, messageId: "serverDependency" });
    });
  },
};
export default noUiDependencies;
