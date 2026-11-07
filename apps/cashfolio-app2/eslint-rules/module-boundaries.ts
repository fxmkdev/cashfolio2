import { relative, resolve, sep } from "node:path";
import type { TSESLint } from "@typescript-eslint/utils";
import {
  dependencyVisitors,
  isTestSupport,
  isWithin,
  localImportTarget,
  routePrivateOwner,
} from "./import-paths.ts";

type Options = [{ sourceRoot: string; serverFacades: string[] }];
type MessageIds = "routePrivate" | "serverFacade" | "testSupport";

const moduleBoundaries: TSESLint.RuleModule<MessageIds, Options> = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Respect route ownership, public server facades, and test support boundaries",
    },
    schema: [
      {
        type: "object",
        properties: {
          sourceRoot: { type: "string" },
          serverFacades: {
            type: "array",
            items: { type: "string" },
            uniqueItems: true,
          },
        },
        required: ["sourceRoot", "serverFacades"],
        additionalProperties: false,
      },
    ],
    messages: {
      routePrivate:
        "Route-private modules belong to their route subtree. Move cross-route code to a shared UI or domain owner.",
      serverFacade:
        "Client-facing modules must import public server facades, including for types; server implementations and .server leaves are private.",
      testSupport: "Production modules must not import test or story support.",
    },
  },
  create(context) {
    const { sourceRoot, serverFacades } = context.options[0];
    const filename = resolve(context.filename);
    if (isTestSupport(filename)) return {};
    const server = resolve(sourceRoot, "server");
    // API routes and explicit server entry points are server-only consumers.
    const serverConsumer =
      isWithin(filename, server) ||
      /\.server\.[jt]sx?$/.test(filename) ||
      isWithin(filename, resolve(sourceRoot, "routes/api")) ||
      filename === resolve(sourceRoot, "server.tsx");
    const facades = new Set(serverFacades);
    return dependencyVisitors((specifier, node) => {
      const target = localImportTarget(sourceRoot, filename, specifier);
      if (!target) return;
      if (isTestSupport(target))
        context.report({ node, messageId: "testSupport" });
      const owner = routePrivateOwner(sourceRoot, target);
      if (owner && !isWithin(filename, owner))
        context.report({ node, messageId: "routePrivate" });
      if (!serverConsumer) {
        const serverPath = relative(server, target)
          .split(sep)
          .join("/")
          .replace(/\.[cm]?[jt]sx?$/, "");
        if (
          /\.server(?:\.[cm]?[jt]sx?)?$/.test(target) ||
          (isWithin(target, server) && !facades.has(serverPath))
        )
          context.report({ node, messageId: "serverFacade" });
      }
    });
  },
};
export default moduleBoundaries;
