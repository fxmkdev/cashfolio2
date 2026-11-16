import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { createId } from "@paralleldrive/cuid2";
import { readRefreshArguments } from "../src/securities-refresh/options.ts";
import {
  selectWebImage,
  processExit,
  createMachinesApi,
  type MachinesApi,
  type Machine,
} from "./run-provider-usage-cleanup.ts";
const execute = promisify(execFile);
export async function runSecuritiesRefresh(options: {
  api: MachinesApi;
  region: string;
  readLogs: (id: string) => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  signal?: AbortSignal;
  onlyIfMissing?: boolean;
}) {
  const { api, region, readLogs, signal } = options;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const clock = options.clock ?? Date.now;
  const deadline = clock() + 32 * 60 * 1000;
  const name = `securities-refresh-${createId()}`;
  let id: string | undefined;
  let attempted = false;
  const check = () => {
    if (signal?.aborted || clock() >= deadline)
      throw new Error("Securities refresh cancelled or timed out.");
  };
  try {
    const image = selectWebImage((await api("GET", "")) as Machine[]);
    attempted = true;
    const machine = (await api("POST", "", {
      name,
      region,
      skip_launch: false,
      config: {
        image,
        init: {
          exec: [
            "node",
            "/app/apps/cashfolio-app2/dist/securities-refresh/refresh.mjs",
            ...(options.onlyIfMissing ? ["--if-missing"] : []),
          ],
        },
        guest: { cpu_kind: "shared", cpus: 1, memory_mb: 512 },
        services: [],
        restart: { policy: "no" },
        auto_destroy: false,
        metadata: { fly_process_group: "securities-refresh" },
      },
    })) as Machine;
    if (!machine?.id)
      throw new Error("Fly did not return a refresh Machine ID.");
    id = machine.id;
    while (true) {
      check();
      const state = (await api("GET", `/${id}`)) as Machine;
      if (state.state === "stopped" && processExit(state) !== null) {
        if (processExit(state) !== 0)
          throw new Error(
            "The securities refresh process failed. Inspect provider usage and refresh logs.",
          );
        break;
      }
      if (["destroyed", "failed", "launch_failed"].includes(state.state ?? ""))
        throw new Error("The securities refresh Machine failed to launch.");
      await sleep(2000);
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      check();
      const logs = await readLogs(id);
      for (const line of logs.trim().split(/\r?\n(?=\{)/)) {
        try {
          const message: unknown = JSON.parse(line).message;
          if (
            typeof message !== "string" ||
            !message.startsWith("SECURITIES_REFRESH ")
          )
            continue;
          const value = JSON.parse(message.slice("SECURITIES_REFRESH ".length));
          if (
            ["completed", "skipped"].includes(value.status) &&
            Number.isSafeInteger(value.rows) &&
            value.rows >= 0 &&
            Number.isSafeInteger(value.pages) &&
            value.pages >= 0 &&
            (!options.onlyIfMissing ||
              (typeof value.version === "string" &&
                value.version.length > 0 &&
                value.rows > 0 &&
                (value.status === "completed" ||
                  value.reason === "catalogue-present")))
          ) {
            console.log(
              `Securities ${options.onlyIfMissing ? "initialization" : "refresh"} ${value.status}: ${value.rows} listings, ${value.pages} pages${value.reason === "catalogue-present" ? "; catalogue already available, no provider requests" : ""}.`,
            );
            return;
          }
        } catch {
          /* Never forward arbitrary remote logs or credentials. */
        }
      }
      await sleep(2000);
    }
    throw new Error(
      "Refresh exited without completion metrics. Verify the deployed image contains the refresh payload.",
    );
  } finally {
    if (!id && attempted)
      id = ((await api("GET", "")) as Machine[]).find(
        (machine) => machine.name === name,
      )?.id;
    if (id) {
      try {
        await api("POST", `/${id}/stop`, { signal: "SIGTERM", timeout: "5s" });
      } catch {
        /* Force destroy still runs. */
      }
      await api("DELETE", `/${id}?force=true`);
    }
  }
}
async function main() {
  const args = readRefreshArguments(process.argv.slice(2));
  if (args.smoke)
    throw new Error("The Fly runner supports --if-missing or no arguments.");
  const {
    FLY_APP: app,
    FLY_API_TOKEN: token,
    FLY_PRIMARY_REGION: region,
  } = process.env;
  if (
    !app ||
    !/^[a-z0-9][a-z0-9-]{1,62}$/.test(app) ||
    !token ||
    !region ||
    !/^[a-z]{3}$/.test(region)
  )
    throw new Error("Missing or invalid Fly refresh configuration.");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGTERM", cancel);
  process.once("SIGINT", cancel);
  try {
    await runSecuritiesRefresh({
      api: createMachinesApi(app, token),
      region,
      signal: controller.signal,
      onlyIfMissing: args.onlyIfMissing,
      readLogs: async (id) =>
        (
          await execute(
            "flyctl",
            ["logs", "--app", app, "--machine", id, "--no-tail", "--json"],
            { timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
          )
        ).stdout,
    });
  } finally {
    process.removeListener("SIGTERM", cancel);
    process.removeListener("SIGINT", cancel);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    console.error(
      "Securities refresh workflow failed. Inspect the refresh job and Fly Machines.",
    );
    process.exitCode = 1;
  });
}
