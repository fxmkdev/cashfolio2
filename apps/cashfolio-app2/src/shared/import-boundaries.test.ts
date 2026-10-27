import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const eslint = new ESLint({
  cwd: fileURLToPath(new URL("../../", import.meta.url)),
});
const ruleId = "cashfolio/no-ui-dependencies";

async function boundaryMessages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  expect(result.fatalErrorCount).toBe(0);
  return result.messages.filter((message) => message.ruleId === ruleId);
}

describe("configured shared/server import boundaries", () => {
  beforeAll(async () => {
    // Load the real config once outside individual test timeouts. Native TS
    // loading and parser startup can be slower during the full coverage run.
    await eslint.calculateConfigForFile("src/shared/example.ts");
  }, 30_000);

  const dependencies = [
    'import { value } from "@/components/example";',
    'import type { Value } from "@/components/example";',
    'import { type Value } from "@/routes/example";',
    'export { value } from "@/routes/example";',
    'export type { Value } from "@/components/example";',
    'export * from "@/components/example";',
    'export type * from "@/routes/example";',
    'const value = import("@/routes/example");',
    'type Value = import("@/components/example").Value;',
    'const value = require("@/components/example");',
    'import { value } from "../components/example";',
    'import { value } from "../routes/example";',
    'import { value } from "@/shared/../components/example";',
    'import { value } from "./../shared/../routes/example";',
    'import { value } from "@/components";',
    'import { value } from "@/routes";',
  ];

  for (const area of ["shared", "server"]) {
    it.each(dependencies)(`${area} rejects %s`, async (code) => {
      const messages = await boundaryMessages(code, `src/${area}/example.ts`);
      expect(messages).toHaveLength(1);
      expect(messages[0].severity).toBe(2);
      expect(messages[0].messageId).toBe("uiDependency");
    });

    it(`${area} rejects nested relative imports and re-exports`, async () => {
      expect(
        await boundaryMessages(
          'import type { Value } from "../../../components/example"; export * from "../../../routes/example";',
          `src/${area}/domain/nested/example.tsx`,
        ),
      ).toHaveLength(2);
    });

    it.each(["test.ts", "test.tsx", "integration.ts", "integration.tsx"])(
      `${area} allows cross-layer imports in %s files`,
      async (suffix) => {
        expect(
          await boundaryMessages(
            'import type { Value } from "@/components/example"; export * from "../routes/example"; void import("@/routes/example"); type Other = import("@/components/example").Value; const helper = require("@/components/example"); import type { Contract } from "@/server/example"; export * from "../server/example"; void import("@/server/example"); type ServerType = import("@/server/example").Value; const serverHelper = require("@/server/example");',
            `src/${area}/example.${suffix}`,
          ),
        ).toHaveLength(0);
      },
    );
  }

  it.each([
    'import { value } from "@/server/example";',
    'import type { Value } from "@/server/example";',
    'import { type Value } from "@/server/example";',
    'export { value } from "@/server/example";',
    'export type { Value } from "@/server/example";',
    'export * from "@/server/example";',
    'export type * from "@/server/example";',
    'const value = import("@/server/example");',
    'type Value = import("@/server/example").Value;',
    'const value = require("@/server/example");',
    'import type { Value } from "../server/example";',
    'import { value } from "@/shared/../server/example";',
    'export type { Value } from "./../shared/../server/example";',
    'import { value } from "@/server";',
    'import { value } from "../server";',
  ])("shared rejects server dependency: %s", async (code) => {
    const messages = await boundaryMessages(code, "src/shared/example.ts");
    expect(messages).toHaveLength(1);
    expect(messages[0].severity).toBe(2);
    expect(messages[0].messageId).toBe("serverDependency");
  });

  it("shared rejects nested relative server imports and re-exports", async () => {
    const messages = await boundaryMessages(
      'import type { Value } from "../../../server/example"; export * from "../../../server/example";',
      "src/shared/domain/nested/example.tsx",
    );
    expect(messages).toHaveLength(2);
    expect(
      messages.every((message) => message.messageId === "serverDependency"),
    ).toBe(true);
  });

  it.each([
    ["src/shared/example.ts", 'import { value } from "./account-utils";'],
    [
      "src/server/example.ts",
      'import type { Value } from "@/shared/account-options";',
    ],
    ["src/server/domain/example.ts", 'import { value } from "../concurrency";'],
    ["src/server/example.ts", 'import type { Value } from "@/server/example";'],
    ["src/components/example.tsx", 'import { value } from "@/server/example";'],
    ["src/routes/example.tsx", 'import { value } from "@/server/example";'],
    ["src/shared/example.ts", 'import { value } from "react";'],
    [
      "src/shared/example.ts",
      'import type { Value } from "@/.prisma-client/enums";',
    ],
    [
      "src/shared/example.ts",
      'import { value } from "some-package/server/example";',
    ],
    [
      "src/shared/example.ts",
      'import { value } from "@/server-other/example";',
    ],
    [
      "src/shared/example.ts",
      'import { value } from "@/server/../shared/account-utils";',
    ],
    [
      "src/shared/example.ts",
      'import { value } from "some-package/components/example";',
    ],
    [
      "src/shared/example.ts",
      'import { value } from "@/components-other/example";',
    ],
    [
      "src/shared/example.ts",
      'import { value } from "@/components/../shared/account-utils";',
    ],
    [
      "src/components/example.tsx",
      'import type { Value } from "@/shared/account-options";',
    ],
    ["src/routes/example.tsx", 'import { value } from "@/components/example";'],
  ])("permits %s: %s", async (filePath, code) => {
    expect(await boundaryMessages(code, filePath)).toHaveLength(0);
  });
});
