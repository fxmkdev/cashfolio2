import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { setTimeout } from "node:timers/promises";

export async function copyArtifact(t: TestContext, name: string) {
  const directory = await mkdtemp(join(tmpdir(), "cashfolio-artifact-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(new URL(`../${name}`, import.meta.url), directory, {
    recursive: true,
    dereference: true,
  });
  return directory;
}

export function assertRejectedStartup(
  directory: string,
  env: NodeJS.ProcessEnv,
  expected: RegExp,
) {
  const result = spawnSync(
    process.execPath,
    [join(directory, "server/index.mjs")],
    {
      cwd: directory,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        NITRO_HOST: "127.0.0.1",
        PORT: "0",
        NITRO_PORT: "0",
        ...env,
      },
      encoding: "utf8",
      timeout: 10_000,
      killSignal: "SIGKILL",
      maxBuffer: 128_000,
    },
  );
  assert.ifError(result.error);
  assert.notEqual(
    result.status,
    null,
    "Server must exit rather than be killed",
  );
  assert.notEqual(result.status, 0, "Server must reject this configuration");
  assert.match(result.stderr, expected);
}

export async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

export async function startArtifact(
  t: TestContext,
  directory: string,
  env: NodeJS.ProcessEnv = {},
) {
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(directory, "server/index.mjs")], {
    cwd: directory,
    env: {
      NODE_ENV: "production",
      APP_ENVIRONMENT: "preview",
      BASE_URL: baseUrl,
      HOST: "127.0.0.1",
      NITRO_HOST: "127.0.0.1",
      PORT: String(port),
      NITRO_PORT: String(port),
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => (logs = (logs + chunk).slice(-128_000)));
  child.stderr.on("data", (chunk) => (logs = (logs + chunk).slice(-128_000)));
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  let spawnError: Error | undefined;
  child.once("error", (error) => {
    spawnError = error;
  });
  t.after(async () => {
    t.diagnostic(logs);
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    await Promise.race([exited, setTimeout(5_000, undefined, { ref: false })]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await exited;
    }
  });
  const request = (path: string, init?: RequestInit) =>
    fetch(new URL(path, baseUrl), {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      ...init,
    });
  for (let attempt = 0; attempt < 150; attempt++) {
    assert.ifError(spawnError);
    assert(child.exitCode === null && child.signalCode === null, logs);
    try {
      const response = await request("/site.webmanifest");
      assert.equal(response.status, 200, logs);
      assert.equal((await response.json()).display, "standalone");
      return { baseUrl, request };
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    await setTimeout(100);
  }
  assert.fail(`Standalone server failed to become ready:\n${logs}`);
}
