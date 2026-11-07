import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("the standalone deployment server rejects the E2E environment at startup", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "cashfolio-deployment-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  cpSync(new URL("../.output", import.meta.url), directory, {
    recursive: true,
    dereference: true,
  });
  // Also cover lazy server chunks that the startup guard does not execute.
  const serverDirectory = join(directory, "server");
  for (const file of readdirSync(serverDirectory, {
    recursive: true,
    encoding: "utf8",
  })) {
    if (!file.endsWith(".mjs") && !file.endsWith(".js")) continue;
    assert.doesNotMatch(
      readFileSync(join(serverDirectory, file), "utf8"),
      /["']@cashfolio\/book-cache-contracts(?:\/[^"']*)?["']/,
      `Deployment must bundle book-cache contracts in ${file}`,
    );
  }
  const result = spawnSync(
    process.execPath,
    [join(directory, "server/index.mjs")],
    {
      cwd: directory,
      env: {
        NODE_ENV: "production",
        APP_ENVIRONMENT: "e2e",
        HOST: "127.0.0.1",
        NITRO_HOST: "127.0.0.1",
        PORT: "0",
        NITRO_PORT: "0",
      },
      encoding: "utf8",
      timeout: 10_000,
      killSignal: "SIGKILL",
      maxBuffer: 64_000,
    },
  );
  assert.ifError(result.error);
  assert.notEqual(
    result.status,
    null,
    "Server must exit rather than be killed",
  );
  assert.notEqual(result.status, 0, "Server must reject this configuration");
  assert.match(
    result.stderr,
    /Unsafe E2E configuration: APP_ENVIRONMENT=e2e requires an E2E build\./,
  );
});
