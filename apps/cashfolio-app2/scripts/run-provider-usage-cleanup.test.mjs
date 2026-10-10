import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createMachinesApi,
  parseCleanupLogs,
  processExit,
  runCleanupJob,
  selectWebImage,
  summaryMarkdown,
} from "./run-provider-usage-cleanup.mjs";

const web = (digest = "sha256:deployed") => ({
  config: { metadata: { fly_process_group: "app" } },
  image_ref: { registry: "registry.fly.io", repository: "cashfolio", digest },
});
const metrics = {
  status: "completed",
  cutoff: "2026-07-12T12:00:00.000Z",
  deletedRows: 2005,
  batchCount: 3,
  elapsedMs: 100,
  tableBytes: 8192,
};
const log = (value = metrics) =>
  JSON.stringify({
    message: `PROVIDER_USAGE_CLEANUP ${JSON.stringify(value)}`,
  });
const stopped = (exit = { exited_at: "2026-10-10T12:00:00Z" }) => ({
  state: "stopped",
  events: [{ timestamp: 1, request: { exit_event: exit } }],
});

function fixture(options = {}) {
  const calls = [];
  const reports = [];
  let time = 0;
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (options.failDestroy && method === "DELETE") throw Error("token secret");
    if (options.failStart && path.endsWith("/start"))
      throw Error("token secret");
    if (method === "GET" && path === "") return options.machines ?? [web()];
    if (method === "POST" && path === "") return { id: "temporary" };
    if (method === "GET") return options.state ?? stopped();
  };
  return {
    calls,
    reports,
    args: {
      api,
      readLogs: async () => options.logs ?? log(),
      report: async (...values) => reports.push(values),
      region: "fra",
      clock: () => time,
      sleep: async (ms) => {
        time += ms;
      },
      timeoutMs: 60_000,
      ...options.overrides,
    },
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
        ...stopped().events.map((event) => ({ ...event, timestamp: 2 })),
      ],
    }),
    0,
  );
});

test("runs the deployed payload without services and destroys a successful Machine", async () => {
  const { args, calls, reports } = fixture();
  assert.deepEqual(await runCleanupJob(args), metrics);
  const config = calls.find(
    (call) => call.method === "POST" && !call.path,
  ).body;
  assert.equal(config.skip_launch, true);
  assert.deepEqual(config.config.init.exec, [
    "node",
    "/app/apps/cashfolio-app2/dist/provider-usage-cleanup/cleanup.mjs",
  ]);
  assert.deepEqual(config.config.guest, {
    cpu_kind: "shared",
    cpus: 1,
    memory_mb: 512,
  });
  assert.deepEqual(config.config.services, []);
  assert.deepEqual(config.config.restart, { policy: "no" });
  assert.equal(config.config.env, undefined);
  assert.equal(calls.at(-1).method, "DELETE");
  assert.ok(!calls.some((call) => call.path.endsWith("/stop")));
  assert.deepEqual(reports, [[metrics, true]]);
});

test("mixed deployed images fail before creating a Machine", async () => {
  const { args, calls } = fixture({ machines: [web(), web("other")] });
  await assert.rejects(runCleanupJob(args), /different images/);
  assert.equal(calls.length, 1);
});

for (const [name, options, message] of [
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
  ["failed start", { failStart: true }, /operation failed/],
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
]) {
  test(`${name} fails and cleans up any created Machine`, async () => {
    const { args, calls, reports } = fixture(options);
    await assert.rejects(runCleanupJob(args), message);
    if (calls.some((call) => call.path === "/temporary/start")) {
      assert.ok(calls.some((call) => call.path === "/temporary/stop"));
      assert.equal(calls.at(-1).method, "DELETE");
    }
    assert.equal(reports.at(-1)[1], false);
  });
}

test("destruction failure fails the job even after a successful cleanup", async () => {
  const { args, reports } = fixture({ failDestroy: true });
  await assert.rejects(runCleanupJob(args), /destroy/);
  assert.equal(reports.at(-1)[1], false);
});

test("cancellation after startup still stops and destroys the Machine", async () => {
  const { args, calls } = fixture();
  args.signal = {
    get aborted() {
      return calls.some((call) => call.path.endsWith("/start"));
    },
  };
  await assert.rejects(runCleanupJob(args), /cancelled/);
  assert.equal(calls.at(-2).path, "/temporary/stop");
  assert.equal(calls.at(-1).method, "DELETE");
});

test("failed stop does not prevent force-destruction", async () => {
  const { args, calls } = fixture({ failStart: true });
  const api = args.api;
  args.api = async (...values) => {
    const result = await api(...values);
    if (values[1].endsWith("/stop")) throw Error("private error");
    return result;
  };
  await assert.rejects(runCleanupJob(args), /operation failed/);
  assert.equal(calls.at(-1).method, "DELETE");
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

test("lost create response recovers and destroys by unique name", async () => {
  const { args } = fixture();
  let created;
  const calls = [];
  args.api = async (method, path, body) => {
    calls.push({ method, path });
    if (method === "GET") return created ? [created] : [web()];
    if (method === "POST" && !path) {
      created = { id: "recovered", name: body.name };
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

test("Machines API never includes response bodies in errors", async (context) => {
  context.mock.method(globalThis, "fetch", async () => ({
    ok: false,
    status: 401,
    text: async () => "access_key=secret",
  }));
  await assert.rejects(createMachinesApi("app", "secret")("GET", ""), {
    message: "Fly Machines API returned HTTP 401.",
  });
});
