import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

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
            'import type { Value } from "@/components/example"; export * from "../routes/example"; void import("@/routes/example"); type Other = import("@/components/example").Value; const helper = require("@/components/example");',
            `src/${area}/example.${suffix}`,
          ),
        ).toHaveLength(0);
      },
    );
  }

  it.each([
    ["src/shared/example.ts", 'import { value } from "./account-utils";'],
    [
      "src/server/example.ts",
      'import type { Value } from "@/shared/account-options";',
    ],
    ["src/server/domain/example.ts", 'import { value } from "../concurrency";'],
    ["src/shared/example.ts", 'import { value } from "react";'],
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
