import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createMachinesApi,
  parseCleanupLogs,
  processExit,
  runCleanupJob,
  selectWebImage,
  summaryMarkdown,
  type CleanupJobOptions,
  type CleanupSummary,
  type ExitEvent,
  type Machine,
  type MachinesApi,
} from "./run-provider-usage-cleanup.ts";

const web = (digest = "sha256:deployed") => ({
  config: { metadata: { fly_process_group: "app" } },
  image_ref: { registry: "registry.fly.io", repository: "cashfolio", digest },
});
const metrics: CleanupSummary = {
  status: "completed",
  cutoff: "2026-07-12T12:00:00.000Z",
  deletedRows: 2005,
  batchCount: 3,
  elapsedMs: 100,
  tableBytes: 8192,
};
const log = (value: unknown = metrics) =>
  JSON.stringify({
    message: `PROVIDER_USAGE_CLEANUP ${JSON.stringify(value)}`,
  });
const stopped = (
  exit: ExitEvent = { exited_at: "2026-10-10T12:00:00Z" },
): Machine => ({
  state: "stopped",
  events: [{ timestamp: 1, request: { exit_event: exit } }],
});

interface FixtureOptions {
  failDestroy?: boolean;
  machines?: Machine[];
  state?: Machine;
  states?: Machine[];
  logs?: string;
  overrides?: Partial<CleanupJobOptions>;
}

function fixture(options: FixtureOptions = {}) {
  const calls: Parameters<MachinesApi>[] = [];
  const reports: Parameters<CleanupJobOptions["report"]>[] = [];
  let time = 0;
  let poll = 0;
  const api: MachinesApi = async (method, path, body) => {
    calls.push([method, path, body]);
    if (options.failDestroy && method === "DELETE") throw Error("token secret");
    if (path.endsWith("/start"))
      throw Error("Explicit start races image preparation");
    if (method === "GET" && path === "") return options.machines ?? [web()];
    if (method === "POST" && path === "") return { id: "temporary" };
    if (method === "GET") {
      const states = options.states;
      return states
        ? states[Math.min(poll++, states.length - 1)]
        : (options.state ?? stopped());
    }
  };
  const args: CleanupJobOptions = {
    api,
    readLogs: async () => options.logs ?? log(),
    report: async (...values) => {
      reports.push(values);
    },
    region: "fra",
    clock: () => time,
    sleep: async (ms) => {
      time += ms;
    },
    timeoutMs: 60_000,
    ...options.overrides,
  };
  return {
    calls,
    reports,
    args,
  };
}

test("selects immutable web image, ignoring maintenance Machines", () => {
  assert.equal(
    selectWebImage([
      web(),
      web(),
      { config: { metadata: { fly_process_group: "provider-usage-cleanup" } } },
    ]),
    "registry.fly.io/cashfolio@sha256:deployed",
  );
  assert.throws(() => selectWebImage([]), /No deployed/);
  assert.throws(
    () => selectWebImage([web(), web("sha256:older")]),
    /different images/,
  );
  assert.throws(
    () =>
      selectWebImage([{ config: { metadata: { fly_process_group: "app" } } }]),
    /digest/,
  );
});

test("verifies Fly exit events including omitted zero code and MonitorEvent", () => {
  assert.equal(processExit(stopped()), 0);
  assert.equal(
    processExit(
      stopped({ exited_at: "date", exit_code: 0, guest_exit_code: 1 }),
    ),
    1,
  );
  assert.equal(
    processExit({
      events: [
        {
          request: {
            MonitorEvent: { exit_event: { exited_at: "date", exit_code: 2 } },
          },
        },
      ],
    }),
    2,
  );
  assert.equal(processExit({ state: "stopped" }), null);
  for (const flag of ["oom_killed", "requested_stop", "signal", "guest_signal"])
    assert.equal(processExit(stopped({ exited_at: "date", [flag]: 1 })), 1);
  assert.equal(
    processExit({
      events: [
        {
          timestamp: 1,
          request: { exit_event: { exited_at: "date", exit_code: 1 } },
        },
        ...stopped().events!.map((event) => ({ ...event, timestamp: 2 })),
      ],
    }),
    0,
  );
});

test("handles a cleanup that exits before the first poll and destroys the Machine", async () => {
  const { args, calls, reports } = fixture();
  assert.deepEqual(await runCleanupJob(args), metrics);
  const body = calls.find(([method, path]) => method === "POST" && !path)?.[2];
  assert.deepEqual(body, {
    name: body?.name,
    region: "fra",
    skip_launch: false,
    config: {
      image: "registry.fly.io/cashfolio@sha256:deployed",
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
  assert.equal(calls.at(-1)?.[0], "DELETE");
  assert.ok(!calls.some(([, path]) => /\/(start|stop)$/.test(path)));
  assert.deepEqual(reports, [[metrics, true]]);
});

test("waits through asynchronous image preparation without an explicit start", async () => {
  const states: Machine[] = ["pending", "created", "starting", "started"].map(
    (state) => ({ state }),
  );
  states.push(stopped());
  const { args, calls, reports } = fixture({ states });
  assert.deepEqual(await runCleanupJob(args), metrics);
  assert.equal(
    calls.filter(([method, path]) => method === "GET" && path === "/temporary")
      .length,
    states.length,
  );
  assert.ok(!calls.some(([, path]) => path.endsWith("/start")));
  assert.equal(
    calls.filter(([method, path]) => method === "POST" && path === "").length,
    1,
  );
  assert.equal(calls.at(-1)?.[0], "DELETE");
  assert.deepEqual(reports, [[metrics, true]]);
});

test("mixed deployed images fail before creating a Machine", async () => {
  const { args, calls } = fixture({ machines: [web(), web("other")] });
  await assert.rejects(runCleanupJob(args), /different images/);
  assert.equal(calls.length, 1);
});

const failures: [string, FixtureOptions, RegExp][] = [
  [
    "failed process",
    {
      state: stopped({ exited_at: "date", exit_code: 1 }),
      logs: log({ ...metrics, status: "failed" }),
    },
    /exited unsuccessfully/,
  ],
  ["timeout", { state: { state: "started" } }, /timed out/],
  ["missing exit event", { state: { state: "stopped" } }, /timed out/],
  ["old image without metrics", { logs: "" }, /completion metrics/],
  ["failed startup", { state: { state: "failed" } }, /failed before/],
  ["failed launch", { state: { state: "launch_failed" } }, /failed before/],
  [
    "destroyed during startup",
    { state: { state: "destroyed" } },
    /failed before/,
  ],
  ["image preparation timeout", { state: { state: "created" } }, /timed out/],
  [
    "cancellation",
    {
      overrides: {
        signal: {
          get aborted() {
            return true;
          },
        },
      },
    },
    /cancelled/,
  ],
];
for (const [name, options, message] of failures) {
  test(`${name} fails and cleans up any created Machine`, async () => {
    const { args, calls, reports } = fixture(options);
    await assert.rejects(runCleanupJob(args), message);
    if (calls.some(([method, path]) => method === "POST" && path === "")) {
      assert.ok(calls.some(([, path]) => path === "/temporary/stop"));
      assert.equal(calls.at(-1)?.[0], "DELETE");
    }
    assert.equal(reports.at(-1)?.[1], false);
  });
}

test("destruction failure fails the job even after a successful cleanup", async () => {
  const { args, reports } = fixture({ failDestroy: true });
  await assert.rejects(runCleanupJob(args), /destroy/);
  assert.equal(reports.at(-1)?.[1], false);
});

test("cancellation after auto-launch creation still stops and destroys the Machine", async () => {
  const { args, calls } = fixture();
  args.signal = {
    get aborted() {
      return calls.some(([method, path]) => method === "POST" && path === "");
    },
  };
  await assert.rejects(runCleanupJob(args), /cancelled/);
  assert.equal(calls.at(-2)?.[1], "/temporary/stop");
  assert.equal(calls.at(-1)?.[0], "DELETE");
});

test("cancellation during image preparation stops and destroys the Machine", async () => {
  const { args, calls } = fixture({ state: { state: "created" } });
  args.signal = {
    get aborted() {
      return calls.some(
        ([method, path]) => method === "GET" && path === "/temporary",
      );
    },
  };
  await assert.rejects(runCleanupJob(args), /cancelled/);
  assert.equal(
    calls.filter(([method, path]) => method === "GET" && path === "/temporary")
      .length,
    1,
  );
  assert.equal(calls.at(-2)?.[1], "/temporary/stop");
  assert.equal(calls.at(-1)?.[0], "DELETE");
});

test("failed stop does not prevent force-destruction", async () => {
  const { args, calls } = fixture({ state: { state: "failed" } });
  const api = args.api;
  args.api = async (...values) => {
    const result = await api(...values);
    if (values[1].endsWith("/stop")) throw Error("private error");
    return result;
  };
  await assert.rejects(runCleanupJob(args), /failed before/);
  assert.equal(calls.at(-1)?.[0], "DELETE");
});

test("parses Fly's concatenated pretty-printed JSON logs", () => {
  const entries = [
    { message: "unrelated", metadata: { value: "secret" } },
    JSON.parse(log({ ...metrics, status: "running" })),
    JSON.parse(log()),
  ];
  assert.deepEqual(
    parseCleanupLogs(
      entries.map((entry) => JSON.stringify(entry, null, 4)).join("\n") + "\n",
    ),
    metrics,
  );
});

test("reordered log delivery cannot replace terminal metrics with earlier progress", () => {
  assert.deepEqual(
    parseCleanupLogs(
      [
        log(),
        log({ ...metrics, status: "running" }),
        log({
          ...metrics,
          status: "running",
          elapsedMs: 50,
          deletedRows: 1000,
        }),
      ].join("\n"),
    ),
    metrics,
  );
});

test("lost create response recovers and destroys by unique name", async () => {
  const { args } = fixture();
  let created: Machine | undefined;
  const calls: { method: string; path: string }[] = [];
  args.api = async (method, path, body) => {
    calls.push({ method, path });
    if (method === "GET") return created ? [created] : [web()];
    if (method === "POST" && !path) {
      created = { id: "recovered", name: body?.name as string };
      throw Error("secret");
    }
  };
  await assert.rejects(runCleanupJob(args), /operation failed/);
  assert.deepEqual(calls.slice(-2), [
    { method: "POST", path: "/recovered/stop" },
    { method: "DELETE", path: "/recovered?force=true" },
  ]);
});

test("sanitizes logs by validating and projecting only numeric metrics", () => {
  assert.deepEqual(
    parseCleanupLogs(
      `not json\n${log({ ...metrics, secret: "access_key=secret" })}\n${log({ ...metrics, deletedRows: "secret" })}`,
    ),
    metrics,
  );
  for (const invalid of [
    { ...metrics, cutoff: "secret" },
    { ...metrics, elapsedMs: -1 },
    { ...metrics, tableBytes: "secret" },
    { ...metrics, status: "secret" },
  ])
    assert.equal(parseCleanupLogs(log(invalid)), undefined);
  assert.ok(!summaryMarkdown("prod", metrics, true).includes("secret"));
  assert.match(summaryMarkdown("staging", undefined, false), /unavailable/);
});

const apiFailures: [Parameters<MachinesApi>[0], string, number, string][] = [
  ["GET", "", 401, "list Machines"],
  ["POST", "", 412, "create cleanup Machine"],
  ["GET", "/private-machine-id", 404, "inspect cleanup Machine"],
  ["POST", "/private-machine-id/stop", 412, "stop cleanup Machine"],
  ["DELETE", "/private-machine-id?force=true", 500, "destroy cleanup Machine"],
];
for (const [method, path, status, operation] of apiFailures) {
  test(`Machines API identifies ${operation} errors without response bodies or credentials`, async (context) => {
    const response = new Response("access_key=secret", { status });
    const readBody = context.mock.method(response, "text");
    context.mock.method(globalThis, "fetch", async () => response);
    await assert.rejects(
      createMachinesApi("private-app", "secret")(method, path),
      {
        message: `Fly Machines API ${method} (${operation}) returned HTTP ${status}.`,
      },
    );
    assert.equal(readBody.mock.callCount(), 0);
  });
}
