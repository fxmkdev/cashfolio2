import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { RUNTIME_CONFIGURATION_ERROR } from "../../src/security/runtime-configuration.ts";
import { E2E_AUTH_EXTERNAL_ID_COOKIE } from "../../src/e2e/auth-cookie.ts";
import {
  isListening,
  startArtifact,
  unusedPort,
  waitForReady,
} from "./process.ts";

function fixtureEnvironment(port: number): NodeJS.ProcessEnv {
  const databaseUrl = process.env.DATABASE_URL;
  assert(databaseUrl, "DATABASE_URL must point to disposable local PostgreSQL");
  const url = new URL(databaseUrl);
  assert(
    ["127.0.0.1", "localhost", "postgres"].includes(url.hostname) &&
      /(?:^|[_-])(?:test|e2e)(?:$|[_-])/i.test(url.pathname.slice(1)),
    "Build-security checks require a local test/e2e database",
  );
  return {
    PATH: process.env.PATH,
    NODE_ENV: "production",
    DATABASE_URL: databaseUrl,
    HOST: "127.0.0.1",
    NITRO_HOST: "127.0.0.1",
    PORT: String(port),
    NITRO_PORT: String(port),
    BASE_URL: `http://127.0.0.1:${port}`,
    APP_ENVIRONMENT: "prod",
    LOGTO_ENDPOINT: "http://127.0.0.1:1",
    LOGTO_APP_ID: "build-security-fixture",
    LOGTO_APP_SECRET: "build-security-fixture",
    SESSION_SECRET: "build-security-fixture-secret-32-characters",
  };
}

async function expectStartupRejection(
  entry: string,
  overrides: NodeJS.ProcessEnv,
  setting: string,
) {
  const port = await unusedPort();
  const child = startArtifact(entry, {
    ...fixtureEnvironment(port),
    ...overrides,
  });
  let listened = false;
  try {
    const deadline = Date.now() + 15_000;
    while (!child.stopped && Date.now() < deadline) {
      listened ||= await isListening(port);
      await delay(25);
    }
    assert(child.stopped, `Startup guard did not exit for ${setting}`);
    const code = await child.exited;
    assert(code !== null && code !== 0, `Expected nonzero exit for ${setting}`);
    const diagnostics = child.diagnostics();
    assert(
      diagnostics.includes(`${RUNTIME_CONFIGURATION_ERROR} ${setting}`),
      `Missing guard-specific error for ${setting}: ${diagnostics}`,
    );
    assert(
      !listened && !/Listening on/i.test(diagnostics),
      `Artifact opened a listener before rejecting ${setting}`,
    );
  } catch (error) {
    throw new Error(
      `Startup rejection check failed for ${setting}.\n${child.diagnostics()}`,
      { cause: error },
    );
  } finally {
    await child.stop();
  }
}

export async function checkRuntimeBoundaries(): Promise<void> {
  const normal = ".output/server/index.mjs";
  for (const flags of [
    { E2E_TEST_MODE: "true" },
    { E2E_AUTH_BYPASS: "true" },
    { E2E_TEST_MODE: "true", E2E_AUTH_BYPASS: "true" },
  ]) {
    await expectStartupRejection(
      normal,
      flags,
      "E2E_TEST_MODE" in flags ? "E2E_TEST_MODE" : "E2E_AUTH_BYPASS",
    );
  }
  await expectStartupRejection(
    normal,
    { APP_ENVIRONMENT: "e2e" },
    "APP_ENVIRONMENT",
  );

  const port = await unusedPort();
  const child = startArtifact(normal, fixtureEnvironment(port));
  try {
    await waitForReady(child, port);
    for (const cookie of [
      "",
      `${E2E_AUTH_EXTERNAL_ID_COOKIE}=build-security-admin`,
    ]) {
      const response = await fetch(
        `http://127.0.0.1:${port}/account-books/new`,
        {
          headers: { cookie },
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
        },
      );
      assert(
        [301, 302, 303, 307, 308].includes(response.status),
        `Expected anonymous redirect, received ${response.status}`,
      );
      assert.equal(
        new URL(
          response.headers.get("location") ?? "",
          `http://127.0.0.1:${port}`,
        ).pathname,
        "/api/logto/sign-in",
      );
      await response.body?.cancel();
    }
  } catch (error) {
    throw new Error(
      `Normal artifact authentication check failed.\n${child.diagnostics()}`,
      { cause: error },
    );
  } finally {
    await child.stop();
  }

  const e2e = ".output-e2e/server/index.mjs";
  const testEnv = {
    APP_ENVIRONMENT: "e2e",
    E2E_TEST_MODE: "true",
    E2E_AUTH_BYPASS: "true",
  };
  for (const APP_ENVIRONMENT of [
    undefined,
    "prod",
    "production",
    "staging",
    "preview",
  ]) {
    await expectStartupRejection(
      e2e,
      { ...testEnv, APP_ENVIRONMENT },
      "APP_ENVIRONMENT",
    );
  }
  await expectStartupRejection(
    e2e,
    { ...testEnv, E2E_TEST_MODE: "false" },
    "E2E_TEST_MODE",
  );
  for (const NITRO_HOST of ["0.0.0.0", "::", "example.com"]) {
    await expectStartupRejection(
      e2e,
      { ...testEnv, NITRO_HOST },
      "NITRO_HOST/HOST",
    );
  }
  await expectStartupRejection(
    e2e,
    { ...testEnv, HOST: undefined, NITRO_HOST: undefined },
    "NITRO_HOST/HOST",
  );
  for (const BASE_URL of [undefined, "invalid", "https://example.com"]) {
    await expectStartupRejection(e2e, { ...testEnv, BASE_URL }, "BASE_URL");
  }
  const testPort = await unusedPort();
  const testChild = startArtifact(e2e, {
    ...fixtureEnvironment(testPort),
    ...testEnv,
  });
  try {
    await waitForReady(testChild, testPort);
  } finally {
    await testChild.stop();
  }
}
