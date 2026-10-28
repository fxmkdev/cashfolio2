import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

export async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

export function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (connected: boolean) => {
      socket.destroy();
      resolve(connected);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(250, () => finish(false));
  });
}

export function startArtifact(entry: string, env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [entry], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let stopped = false;
  const capture = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-64_000);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const exited = new Promise<number | null>((resolve) => {
    child.once("error", (error) => {
      capture(Buffer.from(error.message));
      stopped = true;
      resolve(null);
    });
    child.once("close", (code) => {
      stopped = true;
      resolve(code);
    });
  });
  return {
    exited,
    get stopped() {
      return stopped;
    },
    diagnostics() {
      // Child environments contain only fixtures plus this disposable DB URL.
      return output
        .replaceAll(env.DATABASE_URL ?? "<unset-database-url>", "[database]")
        .replace(/https?:\/\/[^\s"']+/g, "[url]")
        .replace(
          /(secret|token|password|access_key)\s*[:=]\s*[^\s,}]+/gi,
          "$1=[redacted]",
        );
    },
    async stop() {
      if (stopped) return;
      child.kill("SIGTERM");
      await Promise.race([exited, delay(3_000, undefined, { ref: false })]);
      if (!stopped) child.kill("SIGKILL");
      await exited;
    },
  };
}

export type ArtifactProcess = ReturnType<typeof startArtifact>;

export async function waitForReady(
  child: ArtifactProcess,
  port: number,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !child.stopped) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/favicon.svg`, {
        signal: AbortSignal.timeout(500),
      });
      await response.body?.cancel();
      if (response.status === 200) return;
    } catch {
      /* The listener may not be open yet. */
    }
    await delay(100);
  }
  throw new Error(`Artifact did not become ready.\n${child.diagnostics()}`);
}
