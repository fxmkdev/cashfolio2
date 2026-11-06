import assert from "node:assert/strict";
import test from "node:test";
import { Neon, type Database } from "./neon.ts";
import { databaseName } from "./names.ts";
import { prepareDatabase } from "./prepare.ts";

const env = {
  NEON_API_KEY: "secret-api-token",
  NEON_PROJECT_ID: "project",
  SEED_USER_EXTERNAL_IDS: "tester",
  SEED_ADMIN_EXTERNAL_IDS: "tester",
};
const host = "ep-default.eu-central-1.aws.neon.tech";
const base: Database = {
  name: "neondb",
  owner_name: "owner",
  branch_id: "br-default",
  created_at: "2026-01-01T00:00:00Z",
};
function fixture() {
  const calls: { path: string; method: string }[] = [];
  const state = {
    databases: [{ ...base }],
    branches: [{ id: "br-default", project_id: "project", default: true }],
    endpoints: [
      {
        id: "ep-default",
        host,
        project_id: "project",
        branch_id: "br-default",
        type: "read_write",
      },
    ],
    statuses: ["running", "finished"],
    createError: 0,
    networkError: false,
    paginated: false,
    connection: "",
    transient: 0,
  };
  let sleeps = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://console.neon.tech");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer secret-api-token",
    );
    const path = url.pathname.replace("/api/v2/projects/project", "");
    const method = init?.method ?? "GET";
    calls.push({ path, method });
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status });
    if (state.transient-- > 0) return json({ message: "sensitive-url" }, 503);
    if (path === "/branches") {
      if (state.paginated && !url.searchParams.has("cursor"))
        return json({ branches: [], pagination: { next: "page2" } });
      return json({ branches: state.branches });
    }
    if (path.endsWith("/endpoints"))
      return json({ endpoints: state.endpoints });
    if (path === "/branches/br-default/databases") {
      if (method === "GET") return json({ databases: state.databases });
      const body = JSON.parse(String(init?.body)).database;
      assert.equal(body.owner_name, "owner");
      const exists = state.databases.some((d) => d.name === body.name);
      if (!exists && (!state.createError || state.createError === 409))
        state.databases.push({ ...base, name: body.name });
      if (state.networkError) throw new Error("secret-provider-diagnostic");
      if (exists || state.createError)
        return json(
          { message: "secret-provider-diagnostic" },
          state.createError || 409,
        );
      return json(
        {
          operations: [
            {
              id: "operation-1",
              project_id: "project",
              status: state.statuses[0],
            },
          ],
        },
        201,
      );
    }
    if (path === "/operations/operation-1")
      return json({
        operation: {
          id: "operation-1",
          project_id: "project",
          status: state.statuses[1],
        },
      });
    if (path === "/connection_uri")
      return json({
        uri:
          state.connection ||
          `postgresql://owner:password@${host}/${url.searchParams.get("database_name")}?sslmode=require`,
      });
    if (method === "DELETE") return json({ operations: [] });
    throw new Error("Unexpected API request");
  };
  const neon = new Neon(env, fetcher, async () => {
    sleeps++;
  });
  return { state, calls, neon, sleeps: () => sleeps };
}

test("discovers default branch, endpoint and owner with pagination and creates/reuses only the current branch database", async () => {
  const f = fixture();
  f.state.paginated = true;
  f.state.databases.push({
    ...base,
    name: "postgres",
    owner_name: "system_owner",
  });
  const first = await f.neon.ensure(await f.neon.discover(), "feature/seed");
  assert.equal(first.target.projectId, "project");
  assert.equal(first.target.database, databaseName("feature/seed"));
  assert.equal(
    new URL(first.databaseUrl).searchParams.get("sslmode"),
    "verify-full",
  );
  assert.ok(f.sleeps() > 0);
  const second = await f.neon.ensure(await f.neon.discover(), "feature/seed");
  assert.deepEqual(second, first);
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 1);
  await f.neon.ensure(await f.neon.discover(), "feature/renamed");
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 2);
  assert.ok(f.state.databases.some((d) => d.name === first.target.database));
  assert.ok(
    f.calls.every(
      (c) =>
        c.path.startsWith("/branches") ||
        c.path.startsWith("/operations") ||
        c.path === "/connection_uri",
    ),
  );
});
test("rejects missing/ambiguous defaults, endpoints, owners and inconsistent project metadata before creating anything", async () => {
  const mutations: ((f: ReturnType<typeof fixture>) => void)[] = [
    (f) => {
      f.state.branches = [];
    },
    (f) => {
      f.state.branches.push({ ...f.state.branches[0], id: "br-second" });
    },
    (f) => {
      f.state.branches[0].project_id = "production";
    },
    (f) => {
      f.state.endpoints = [];
    },
    (f) => {
      f.state.endpoints.push({ ...f.state.endpoints[0], id: "ep-second" });
    },
    (f) => {
      f.state.endpoints[0].branch_id = "br-other";
    },
    (f) => {
      f.state.endpoints[0].host = "ep-other.eu.neon.tech";
    },
    (f) => {
      f.state.databases = [];
    },
    (f) => {
      f.state.databases.push({
        ...base,
        name: "other",
        owner_name: "other_owner",
      });
    },
    (f) => {
      f.state.databases[0].branch_id = "br-other";
    },
    (f) => {
      f.state.databases[0].created_at = "invalid";
    },
  ];
  for (const mutate of mutations) {
    const f = fixture();
    mutate(f);
    await assert.rejects(f.neon.discover());
    assert.ok(f.calls.every((c) => c.method === "GET"));
  }
});
test("reconciles creation conflicts but never blindly retries POST or exposes provider errors", async () => {
  const raced = fixture();
  raced.state.createError = 409;
  await raced.neon.ensure(await raced.neon.discover(), "race");
  assert.equal(raced.calls.filter((c) => c.method === "POST").length, 1);
  for (const status of [401, 403, 500, 503]) {
    const f = fixture();
    f.state.createError = status;
    await assert.rejects(
      f.neon.ensure(await f.neon.discover(), "failure"),
      (error) => {
        assert.doesNotMatch(String(error), /secret-|password/);
        return true;
      },
    );
    assert.equal(f.calls.filter((c) => c.method === "POST").length, 1);
    assert.ok(!f.calls.some((c) => c.path === "/connection_uri"));
  }
  const lost = fixture();
  lost.state.networkError = true;
  await lost.neon.ensure(await lost.neon.discover(), "lost-response");
});
test("operation errors/timeouts and unsafe connection URIs stop preparation", async () => {
  for (const statuses of [
    ["running", "failed"],
    ["running", "error"],
    ["running", "cancelled"],
    ["running", "running"],
  ]) {
    const f = fixture();
    f.state.statuses = statuses;
    await assert.rejects(
      f.neon.ensure(await f.neon.discover(), "operation"),
      /operation/,
    );
    assert.ok(!f.calls.some((c) => c.path === "/connection_uri"));
  }
  for (const uri of [
    "bad",
    `postgresql://owner:secret@ep-production.eu.neon.tech/${databaseName("uri")}`,
    `postgresql://other:secret@${host}/${databaseName("uri")}`,
    `postgresql://owner:secret@${host}/other`,
    `postgresql://owner:secret@${host}/${databaseName("uri")}?options=endpoint%3Dep-production`,
    `postgresql://owner:secret@${host}/${databaseName("uri")}?sslmode=require&sslmode=disable`,
    `postgresql://owner:secret@${host}/${databaseName("uri")}?sslmode=require&channel_binding=disable`,
  ]) {
    const f = fixture();
    f.state.connection = uri;
    await assert.rejects(f.neon.ensure(await f.neon.discover(), "uri"));
  }
});
test("bounds transient GET retries and rejects incomplete/pagination loops without deletion", async () => {
  const retry = fixture();
  retry.state.transient = 2;
  await retry.neon.discover();
  assert.equal(retry.sleeps(), 2);
  const exhausted = fixture();
  exhausted.state.transient = 10;
  await assert.rejects(exhausted.neon.discover(), /503/);
  assert.equal(exhausted.calls.length, 5);
  for (const response of [
    {},
    { branches: [], pagination: { next: "loop" } },
    { branches: [], pagination: { next: 0 } },
  ]) {
    const neon = new Neon(
      env,
      async () => new Response(JSON.stringify(response)),
      async () => {},
    );
    await assert.rejects(neon.discover(), /inventory|pagination/);
  }
});
test("rejects wrong owners and unmanaged deletes, and never creates roles or branches", async () => {
  const f = fixture();
  const context = await f.neon.discover();
  context.databases.push({
    ...base,
    name: databaseName("bad-owner"),
    owner_name: "other",
  });
  await assert.rejects(f.neon.ensure(context, "bad-owner"), /ownership/);
  await assert.rejects(
    f.neon.deleteDatabase(context.target, base),
    /unmanaged/,
  );
  await assert.rejects(
    f.neon.deleteDatabase(context.target, {
      ...base,
      name: databaseName("other"),
      owner_name: "other",
    }),
    /unmanaged/,
  );
  await f.neon.deleteDatabase(context.target, {
    ...base,
    name: databaseName("old"),
  });
  assert.equal(f.calls.filter((c) => c.method === "DELETE").length, 1);
  assert.ok(!f.calls.some((c) => c.method === "POST"));
});
test("staging and preview use the same preparation and generated settings without publishing the API key", async () => {
  for (const environment of ["staging", "preview"] as const) {
    const f = fixture();
    const flyApp =
      environment === "staging"
        ? "cashfolio-staging"
        : "cashfolio-app2-pr-42-topic";
    const prepared = await prepareDatabase(
      { branch: "topic", environment, flyApp, sha: "a".repeat(40) },
      env,
      f.neon,
    );
    assert.equal(prepared.target.database, databaseName("topic"));
    assert.equal(prepared.target.environment, environment);
    assert.equal(prepared.target.flyApp, flyApp);
    assert.equal(prepared.outputs.deploy_sha, "a".repeat(40));
    assert.ok(!JSON.stringify(prepared).includes(env.NEON_API_KEY));
    assert.equal(
      JSON.parse(prepared.secrets.SEED_TARGET).endpointId,
      "ep-default",
    );
  }
  const invalid = fixture();
  await assert.rejects(
    prepareDatabase(
      {
        branch: "topic",
        environment: "staging",
        flyApp: "staging",
        sha: "a".repeat(40),
      },
      { ...env, SEED_ADMIN_EXTERNAL_IDS: "unknown" },
      invalid.neon,
    ),
  );
  assert.equal(invalid.calls.length, 0);
  assert.throws(() => new Neon({ ...env, NEON_PROJECT_ID: "bad/project" }));
  assert.throws(() => new Neon({ ...env, NEON_API_KEY: undefined }));
});

test("invalid deployment input cannot create resources and failed deletes remain sanitized", async () => {
  for (const input of [
    {
      environment: "preview" as const,
      flyApp: "staging",
      branch: "topic",
      sha: "a".repeat(40),
    },
    {
      environment: "staging" as const,
      flyApp: "cashfolio-app2-pr-42-topic",
      branch: "topic",
      sha: "a".repeat(40),
    },
    {
      environment: "staging" as const,
      flyApp: "staging",
      branch: "bad\nbranch",
      sha: "a".repeat(40),
    },
    {
      environment: "staging" as const,
      flyApp: "staging",
      branch: "topic",
      sha: "invalid",
    },
  ]) {
    const f = fixture();
    await assert.rejects(prepareDatabase(input, env, f.neon));
    assert.equal(f.calls.length, 0);
  }
  const context = await fixture().neon.discover();
  for (const status of [404, 403, 500]) {
    const neon = new Neon(
      env,
      async () => new Response("sensitive-password", { status }),
    );
    const deletion = neon.deleteDatabase(context.target, {
      ...base,
      name: databaseName("old"),
    });
    if (status === 404) await deletion;
    else
      await assert.rejects(deletion, (error) => {
        assert.doesNotMatch(String(error), /sensitive|password/);
        return true;
      });
  }
});

test("a missing database is harmless, but a missing deletion operation fails cleanup", async () => {
  const context = await fixture().neon.discover();
  let requests = 0;
  const neon = new Neon(
    env,
    async () => {
      return ++requests === 1
        ? new Response(
            JSON.stringify({
              operations: [
                { id: "delete-op", project_id: "project", status: "running" },
              ],
            }),
          )
        : new Response("not found", { status: 404 });
    },
    async () => {},
  );
  await assert.rejects(
    neon.deleteDatabase(context.target, { ...base, name: databaseName("old") }),
    /404/,
  );
});
