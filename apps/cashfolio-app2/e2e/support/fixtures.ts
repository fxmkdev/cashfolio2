import {
  expect,
  test as base,
  type BrowserContext,
  type TestInfo,
} from "@playwright/test";
import { createId } from "@paralleldrive/cuid2";
import { E2E_AUTH_EXTERNAL_ID_COOKIE } from "../../src/auth/e2e-auth";

type E2EWorkerFixtures = {
  e2eExternalId: string;
};

function getBaseUrl(testInfo: TestInfo): string {
  return typeof testInfo.project.use.baseURL === "string"
    ? testInfo.project.use.baseURL
    : "http://127.0.0.1:4173";
}

export async function setE2EAuthCookie(
  context: BrowserContext,
  externalId: string,
  testInfo: TestInfo,
): Promise<void> {
  await context.addCookies([
    {
      name: E2E_AUTH_EXTERNAL_ID_COOKIE,
      value: externalId,
      url: getBaseUrl(testInfo),
    },
  ]);
}

export async function useIsolatedE2EUser(
  context: BrowserContext,
  testInfo: TestInfo,
): Promise<string> {
  const externalId = `e2e-${testInfo.workerIndex}-${createId()}`;
  await setE2EAuthCookie(context, externalId, testInfo);
  return externalId;
}

export const test = base.extend<Record<string, never>, E2EWorkerFixtures>({
  e2eExternalId: [
    async ({ browserName: _browserName }, fixtureUse, workerInfo) => {
      await fixtureUse(`e2e-worker-${workerInfo.workerIndex}-${createId()}`);
    },
    { scope: "worker" },
  ],
  context: async ({ context, e2eExternalId }, fixtureUse, testInfo) => {
    await setE2EAuthCookie(context, e2eExternalId, testInfo);
    await fixtureUse(context);
  },
});

export { expect };
export type { BrowserContext, Locator, Page, TestInfo } from "@playwright/test";
