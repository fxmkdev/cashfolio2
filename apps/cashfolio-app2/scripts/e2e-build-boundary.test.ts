import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertRejectedStartup,
  copyArtifact,
  startArtifact,
} from "./artifact-test-support.ts";

test("the isolated E2E artifact retains MSW assets and enforces its runtime boundary", async (t) => {
  const directory = await copyArtifact(t, ".output-e2e");
  const files = await readdir(directory, { recursive: true });
  const wasm = files.find((file) =>
    /@mswjs\/interceptors\/.*llhttp\/llhttp\.wasm$/.test(file),
  );
  assert(wasm, "E2E output must retain the interceptor package's parser asset");
  assert.deepEqual(
    (await readFile(join(directory, wasm))).subarray(0, 4),
    Buffer.from([0, 97, 115, 109]),
  );
  const valid = { APP_ENVIRONMENT: "e2e", BASE_URL: "http://127.0.0.1:4173" };
  for (const [env, expected] of [
    [{ ...valid, APP_ENVIRONMENT: "" }, /APP_ENVIRONMENT must be e2e/],
    [{ ...valid, NITRO_HOST: "0.0.0.0" }, /must explicitly bind to loopback/],
    [{ ...valid, BASE_URL: "https://example.com" }, /BASE_URL must be/],
  ] as const) {
    assertRejectedStartup(directory, env, expected);
  }
  await startArtifact(t, directory, { APP_ENVIRONMENT: "e2e" });
});
