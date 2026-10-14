import assert from "node:assert/strict";
import { once } from "node:events";
import net, { type AddressInfo, type Socket } from "node:net";
import { test, type TestContext } from "node:test";
import { createRestoreRedisClient } from "./restore-redis-client";
import { restoreLocal } from "./restore-local";

async function listen(t: TestContext, onConnection?: (socket: Socket) => void) {
  const sockets = new Set<Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    onConnection?.(socket);
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    if (server.listening)
      await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, port: (server.address() as AddressInfo).port };
}

async function assertRestoreConnectionFailure(
  t: TestContext,
  url: string,
  expectedError: (error: unknown) => boolean,
) {
  const errors: Error[] = [];
  const logs: string[] = [];
  const commands: string[] = [];
  const client = createRestoreRedisClient(url, (error) => errors.push(error));
  let reconnects = 0;
  client.on("reconnecting", () => reconnects++);
  let watchdogFired = false;
  // If retries are accidentally restored, fail the test without leaving a live
  // reconnecting client behind. Node's test timeout alone does not stop sockets.
  const watchdog = setTimeout(() => {
    watchdogFired = true;
    client.destroy();
  }, 5000);
  watchdog.unref();
  t.after(() => {
    clearTimeout(watchdog);
    client.destroy();
  });

  await assert.rejects(
    restoreLocal({
      env: {
        RESTORE_DB_URL: "postgresql://unused",
        RESTORE_DB_NAME: "unused",
        RESTORE_REDIS_URL: url,
      },
      async exec(command) {
        commands.push(command);
      },
      createRedisClient(actualUrl) {
        assert.equal(actualUrl, url);
        return client;
      },
      log(message) {
        logs.push(message);
      },
    }),
    expectedError,
  );
  clearTimeout(watchdog);
  assert.equal(watchdogFired, false);
  assert.equal(reconnects, 0);
  assert.equal(errors.length, 1);
  assert.equal(client.isOpen, false);
  assert.equal(client.isReady, false);
  assert.equal(commands.length, 3); // Database operations were mocked throughout.
  assert.ok(!logs.includes("Done"));
  assert.ok(!logs.some((message) => message.startsWith("Deleted ")));
}

test(
  "the production client rejects connection refusal without retrying or hanging restore",
  { timeout: 10000 },
  async (t) => {
    const { server, port } = await listen(t);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await assertRestoreConnectionFailure(
      t,
      `redis://127.0.0.1:${port}`,
      (error) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "ECONNREFUSED",
    );
  },
);

test(
  "the production client rejects authentication failure after one connection",
  { timeout: 10000 },
  async (t) => {
    let connections = 0;
    const requests: string[] = [];
    const { port } = await listen(t, (socket) => {
      connections++;
      socket.on("data", (data) => {
        requests.push(data.toString());
        // Minimal RESP fixture: reject authentication without a real Redis server.
        socket.write("-WRONGPASS invalid username-password pair\r\n");
      });
    });
    await assertRestoreConnectionFailure(
      t,
      `redis://default:invalid@127.0.0.1:${port}`,
      (error) => error instanceof Error && error.message.includes("WRONGPASS"),
    );
    assert.equal(connections, 1);
    assert.ok(requests.join("").includes("AUTH"));
  },
);
