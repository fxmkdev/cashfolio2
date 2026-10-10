import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const LOG_PREFIX = "PROVIDER_USAGE_CLEANUP ";
const JOB_TIMEOUT_MS = 8 * 60 * 1_000;
const execute = promisify(execFile);

export class CleanupJobError extends Error {}

export function selectWebImage(machines) {
  const web = machines.filter(
    (machine) => machine.config?.metadata?.fly_process_group === "app",
  );
  if (!web.length) throw new CleanupJobError("No deployed web Machines found.");
  const images = web.map((machine) => {
    const image = machine.image_ref;
    if (!image?.registry || !image.repository || !image.digest)
      throw new CleanupJobError(
        "Cannot resolve the deployed web image digest.",
      );
    return `${image.registry}/${image.repository}@${image.digest}`;
  });
  if (new Set(images).size !== 1)
    throw new CleanupJobError(
      "Web Machines have different images; retry after deployment finishes.",
    );
  return images[0];
}

export function processExit(machine) {
  const events = [...(machine.events ?? [])].sort(
    (a, b) => b.timestamp - a.timestamp,
  );
  for (const event of events) {
    const exit =
      event.request?.MonitorEvent?.exit_event ?? event.request?.exit_event;
    if (!exit?.exited_at) continue;
    // Fly omits exit_code when it is zero. A stopped state alone is not proof.
    if (
      exit.oom_killed ||
      exit.requested_stop ||
      exit.signal ||
      exit.guest_signal
    )
      return 1;
    return exit.exit_code || exit.guest_exit_code || 0;
  }
  return null;
}

export function parseCleanupLogs(output) {
  let latest;
  // flyctl emits concatenated, indented JSON objects, not just JSON lines.
  for (const entry of output.trim().split(/\r?\n(?=\{)/)) {
    try {
      const message = JSON.parse(entry).message;
      if (typeof message !== "string" || !message.startsWith(LOG_PREFIX))
        continue;
      const value = JSON.parse(message.slice(LOG_PREFIX.length));
      if (
        !["running", "completed", "incomplete", "failed"].includes(
          value.status,
        ) ||
        typeof value.cutoff !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.cutoff) ||
        !Number.isFinite(Date.parse(value.cutoff)) ||
        ![value.deletedRows, value.batchCount, value.elapsedMs].every(
          (number) => Number.isSafeInteger(number) && number >= 0,
        ) ||
        !(
          value.tableBytes === null ||
          (Number.isSafeInteger(value.tableBytes) && value.tableBytes >= 0)
        )
      )
        continue;
      if (
        latest &&
        (value.elapsedMs < latest.elapsedMs ||
          (value.elapsedMs === latest.elapsedMs &&
            (value.deletedRows < latest.deletedRows ||
              (latest.status !== "running" && value.status === "running"))))
      )
        continue;
      latest = {
        status: value.status,
        cutoff: value.cutoff,
        deletedRows: value.deletedRows,
        batchCount: value.batchCount,
        elapsedMs: value.elapsedMs,
        tableBytes: value.tableBytes,
      };
    } catch {
      // Ignore unrelated Fly logs; never forward arbitrary log text or secrets.
    }
  }
  return latest;
}

export function summaryMarkdown(environment, summary, succeeded) {
  return [
    `### Provider usage cleanup: ${environment}`,
    `Result: ${succeeded ? "success" : "failure"}`,
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Status | ${summary?.status ?? "unavailable"} |`,
    `| UTC cutoff (exclusive) | ${summary?.cutoff ?? "unavailable"} |`,
    `| Deleted rows | ${summary?.deletedRows ?? "unavailable"} |`,
    `| Committed batches | ${summary?.batchCount ?? "unavailable"} |`,
    `| Elapsed milliseconds | ${summary?.elapsedMs ?? "unavailable"} |`,
    `| Table + indexes (bytes) | ${summary?.tableBytes ?? "unavailable"} |`,
    "",
  ].join("\n");
}

export async function runCleanupJob({
  api,
  readLogs,
  report,
  region,
  clock = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  signal,
  timeoutMs = JOB_TIMEOUT_MS,
}) {
  const name = `provider-usage-cleanup-${randomUUID()}`;
  const deadline = clock() + timeoutMs;
  let machineId;
  let createAttempted = false;
  let summary;
  let succeeded = false;
  let failure;
  const checkDeadline = () => {
    if (signal?.aborted)
      throw new CleanupJobError("Cleanup job was cancelled.");
    if (clock() >= deadline)
      throw new CleanupJobError("Cleanup Machine timed out.");
  };
  try {
    const image = selectWebImage(await api("GET", ""));
    checkDeadline();
    createAttempted = true;
    const machine = await api("POST", "", {
      name,
      region,
      skip_launch: true,
      config: {
        image,
        init: {
          exec: [
            "node",
            "/app/apps/cashfolio-app2/dist/provider-usage-cleanup/cleanup.mjs",
          ],
        },
        guest: { cpu_kind: "shared", cpus: 1, memory_mb: 512 },
        services: [],
        restart: { policy: "no" },
        auto_destroy: false,
        metadata: { fly_process_group: "provider-usage-cleanup" },
      },
    });
    if (!machine?.id)
      throw new CleanupJobError("Fly did not return a cleanup Machine ID.");
    machineId = machine.id;
    checkDeadline();
    await api("POST", `/${machineId}/start`, {});
    let exitCode;
    while (true) {
      checkDeadline();
      const state = await api("GET", `/${machineId}`);
      if (state.state === "stopped") {
        exitCode = processExit(state);
        if (exitCode !== null) break;
      }
      if (["destroyed", "failed"].includes(state.state))
        throw new CleanupJobError(
          "Cleanup Machine failed before reporting a process exit.",
        );
      await sleep(2_000);
    }
    // Log delivery can lag behind the exit event. Require terminal metrics on success.
    for (let attempt = 0; attempt < 10; attempt++) {
      checkDeadline();
      summary = parseCleanupLogs(await readLogs(machineId)) ?? summary;
      if (summary && summary.status !== "running") break;
      await sleep(2_000);
    }
    if (exitCode !== 0)
      throw new CleanupJobError(
        "Cleanup process exited unsuccessfully; check deployment and database configuration.",
      );
    if (summary?.status !== "completed")
      throw new CleanupJobError(
        "Cleanup exited without completion metrics; verify the deployed image contains the cleanup payload.",
      );
    succeeded = true;
  } catch (error) {
    failure =
      error instanceof CleanupJobError
        ? error
        : new CleanupJobError("Fly cleanup operation failed.");
  } finally {
    // Recover a create whose response was lost, without creating another Machine.
    if (!machineId && createAttempted) {
      try {
        machineId = (await api("GET", "")).find(
          (machine) => machine.name === name,
        )?.id;
      } catch {
        failure = new CleanupJobError(
          "Could not recover the temporary Machine after creation; inspect Fly Machines.",
        );
      }
    }
    if (machineId) {
      if (!summary) {
        try {
          summary = parseCleanupLogs(await readLogs(machineId));
        } catch {
          /* No arbitrary errors in logs. */
        }
      }
      if (!succeeded) {
        try {
          await api("POST", `/${machineId}/stop`, {
            signal: "SIGTERM",
            timeout: "5s",
          });
        } catch {
          /* Force-destroy still runs. */
        }
      }
      try {
        await api("DELETE", `/${machineId}?force=true`);
      } catch {
        failure = new CleanupJobError(
          "Failed to destroy the cleanup Machine; inspect Fly Machines.",
        );
        succeeded = false;
      }
    }
    await report(summary, succeeded && !failure);
  }
  if (failure) throw failure;
  return summary;
}

export function createMachinesApi(app, token) {
  return async (method, path, body) => {
    const response = await fetch(
      `https://api.machines.dev/v1/apps/${encodeURIComponent(app)}/machines${path}`,
      {
        method,
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    if (!response.ok)
      throw new CleanupJobError(
        `Fly Machines API returned HTTP ${response.status}.`,
      );
    if (response.status === 204) return;
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  };
}

async function main() {
  const {
    FLY_APP: app,
    FLY_API_TOKEN: token,
    FLY_PRIMARY_REGION: region,
    CLEANUP_ENVIRONMENT: environment,
  } = process.env;
  const report = async (summary, succeeded) => {
    const markdown = summaryMarkdown(
      ["prod", "staging"].includes(environment) ? environment : "unconfigured",
      summary,
      succeeded,
    );
    console.log(markdown);
    if (process.env.GITHUB_STEP_SUMMARY)
      await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  };
  if (!app || !token || !region || !["prod", "staging"].includes(environment)) {
    await report(undefined, false);
    throw new CleanupJobError(
      "Missing or invalid cleanup workflow configuration.",
    );
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    await runCleanupJob({
      api: createMachinesApi(app, token),
      region,
      signal: controller.signal,
      readLogs: async (machineId) => {
        const result = await execute(
          "flyctl",
          ["logs", "--app", app, "--machine", machineId, "--no-tail", "--json"],
          {
            timeout: 15_000,
            maxBuffer: 4 * 1_024 * 1_024,
          },
        );
        return result.stdout;
      },
      report,
    });
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof CleanupJobError
        ? error.message
        : "Provider usage cleanup workflow failed.",
    );
    process.exitCode = 1;
  });
}
