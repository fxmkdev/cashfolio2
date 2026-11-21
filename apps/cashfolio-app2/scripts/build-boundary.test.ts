import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertRejectedStartup,
  copyArtifact,
  startArtifact,
} from "./artifact-test-support.ts";

test("the standalone deployment bundles contracts and excludes E2E capabilities", async (t) => {
  const directory = await copyArtifact(t, ".output");
  const serverDirectory = join(directory, "server");
  for (const file of await readdir(serverDirectory, { recursive: true })) {
    assert.doesNotMatch(file, /(?:@mswjs|llhttp\.wasm|(?:^|\/)msw\/)/);
    if (!/\.[mc]?js$/.test(file)) continue;
    const source = await readFile(join(serverDirectory, file), "utf8");
    assert.doesNotMatch(
      source,
      /["']@cashfolio\/book-cache-contracts(?:\/[^"']*)?["']/,
      `Deployment must bundle book-cache contracts in ${file}`,
    );
    assert.doesNotMatch(
      source,
      /Unhandled E2E valuation provider request:|cashfolio-e2e-external-id/,
      `Deployment must exclude synthetic authentication and provider mocks in ${file}`,
    );
  }
  assertRejectedStartup(
    directory,
    { APP_ENVIRONMENT: "e2e" },
    /Unsafe E2E configuration: APP_ENVIRONMENT=e2e requires an E2E build\./,
  );
  await startArtifact(t, directory);
});
