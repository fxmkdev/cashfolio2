import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("the deployment server rejects the E2E environment at startup", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../.output/server/index.mjs", import.meta.url))],
    {
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
