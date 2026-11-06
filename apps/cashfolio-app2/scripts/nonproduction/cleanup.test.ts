import assert from "node:assert/strict";
import test from "node:test";
import {
  appsToRetire,
  databasesToDelete,
  openPullRequests,
  sweep,
  type App,
} from "./cleanup.ts";
import { flyInventory } from "./fly.ts";
import { databaseName } from "./names.ts";
import { previewNames } from "../preview/names.ts";
import type { PullRequest } from "../preview/github.ts";
import type { Database } from "./neon.ts";
const now = Date.parse("2026-11-06T12:00:00Z");
const target = {
  projectId: "project",
  branchId: "br-default",
  endpointId: "ep-default",
  hostname: "ep-default.eu.neon.tech",
  database: "neondb",
  role: "owner",
};
const pr: PullRequest = {
  number: 42,
  state: "open",
  title: "Ignored title",
  head: {
    ref: "feature/new",
    sha: "a".repeat(40),
    repo: { full_name: "owner/repo", fork: false },
  },
  base: { repo: { full_name: "owner/repo" } },
};
function app(
  branch: string,
  name = "cashfolio-staging",
  state = "started",
): App {
  return {
    name,
    machines: [
      {
        state,
        config: {
          env: {
            APP_ENVIRONMENT:
              name === "cashfolio-staging" ? "staging" : "preview",
            CASHFOLIO_DATABASE_PROJECT_ID: target.projectId,
            CASHFOLIO_DATABASE_BRANCH_ID: target.branchId,
            CASHFOLIO_DATABASE_NAME: databaseName(branch),
            CASHFOLIO_DEPLOY_SHA: pr.head.sha,
          },
        },
      },
    ],
  };
}
const db = (branch: string, age = 2 * 86_400_000): Database => ({
  name: databaseName(branch),
  owner_name: "owner",
  branch_id: target.branchId,
  created_at: new Date(now - age).toISOString(),
});

test("retains Git branches and deployed databases, including stopped/suspended Machines, and only prunes old managed names", () => {
  const list = [
    db("main"),
    db(pr.head.ref),
    db("still-deployed"),
    db("suspended"),
    db("stopped"),
    db("young", 86_399_999),
    db("future", -1000),
    db("boundary", 86_400_000),
    db("stale"),
    { ...db("legacy"), name: "neondb" },
  ];
  const result = databasesToDelete({
    databases: list,
    apps: [
      app("still-deployed"),
      app("suspended", "cashfolio-app2-pr-1-old", "suspended"),
      app("stopped", "cashfolio-app2-pr-2-old", "stopped"),
    ],
    prs: [pr],
    defaultBranch: "main",
    target,
    now,
  });
  assert.deepEqual(
    result.map((d) => d.name),
    [databaseName("boundary"), databaseName("stale")],
  );
});
test("refuses incomplete metadata, wrong projects/owners and invalid dates before selecting any deletion", () => {
  for (const broken of [
    { name: "cashfolio-staging", machines: [{ state: "started", config: {} }] },
    app("old"),
  ]) {
    if (broken.machines[0].config.env)
      broken.machines[0].config.env.CASHFOLIO_DATABASE_PROJECT_ID =
        "production";
    assert.throws(
      () =>
        databasesToDelete({
          databases: [db("stale")],
          apps: [broken],
          prs: [],
          defaultBranch: "main",
          target,
          now,
        }),
      /inventory/,
    );
  }
  for (const invalid of [
    { ...db("bad"), created_at: "invalid" },
    { ...db("bad"), owner_name: "other" },
    { ...db("bad"), branch_id: "br-other" },
  ])
    assert.throws(
      () =>
        databasesToDelete({
          databases: [db("stale"), invalid],
          apps: [],
          prs: [],
          defaultBranch: "main",
          target,
          now,
        }),
      /inventory/,
    );
});
test("retains rename orphans until the current app has matching commit/database metadata and responds successfully", async () => {
  const old = app("feature/old", "cashfolio-app2-pr-42-old");
  const current = app(pr.head.ref, previewNames(42, pr.head.ref).flyApp);
  const closed = app("closed", "cashfolio-app2-pr-43-closed");
  const staging = app("main");
  assert.deepEqual(
    await appsToRetire(
      [staging, old, current, closed],
      [pr],
      target,
      async () => false,
    ),
    [closed.name],
  );
  assert.deepEqual(
    await appsToRetire(
      [staging, old, current, closed],
      [pr],
      target,
      async () => true,
    ),
    [old.name, closed.name],
  );
  current.machines[0].config.env!.CASHFOLIO_DEPLOY_SHA = "b".repeat(40);
  assert.deepEqual(
    await appsToRetire([old, current], [pr], target, async () => true),
    [],
  );
  current.machines[0].config.env!.CASHFOLIO_DEPLOY_SHA = pr.head.sha;
  current.machines[0].state = "failed";
  assert.deepEqual(
    await appsToRetire([old, current], [pr], target, async () => true),
    [],
  );
  // With failed new deployment, the old running app's reference protects its DB.
  assert.deepEqual(
    databasesToDelete({
      databases: [db("feature/old")],
      apps: [old],
      prs: [pr],
      defaultBranch: "main",
      target,
      now,
    }),
    [],
  );
});
test("GitHub and Fly inventories reject incomplete pages and missing Machines rather than treating them as unused", async () => {
  const full = Array.from({ length: 100 }, () => pr);
  let pages = 0;
  const prs = await openPullRequests(
    async <T>() => (++pages === 1 ? full : []) as T,
    "owner/repo",
  );
  assert.equal(prs.length, 100);
  assert.equal(pages, 2);
  await assert.rejects(
    openPullRequests(async <T>() => ({}) as T, "owner/repo"),
    /inventory/,
  );
  await assert.rejects(
    openPullRequests(async () => {
      throw new Error("unavailable");
    }, "owner/repo"),
  );
  for (const data of ["{}", "[]", '[{"Name":"cashfolio-staging"}]']) {
    let calls = 0;
    await assert.rejects(
      flyInventory("cashfolio-staging", async () =>
        ++calls === 1 ? data : "{}",
      ),
      /inventory/,
    );
  }
  const listed = await flyInventory("cashfolio-staging", async (args) =>
    args[0] === "apps"
      ? '[{"Name":"cashfolio-staging"},{"name":"unrelated"}]'
      : JSON.stringify(app("main").machines),
  );
  assert.equal(listed.length, 1);
});
test("cleanup never deletes databases after inventory/retirement failure and refreshes references before deletion", async () => {
  const calls: string[] = [];
  const staging = app("main");
  const closed = app("closed", "cashfolio-app2-pr-43-closed");
  const neon = {
    discover: async () => ({ target, databases: [db("stale")] }),
    databases: async () => [db("stale")],
    deleteDatabase: async () => {
      calls.push("delete");
    },
  };
  let reads = 0;
  const deps = {
    prs: [pr],
    defaultBranch: "main",
    now,
    neon,
    healthy: async () => true,
    inventory: async () => {
      calls.push("inventory");
      return ++reads === 1 ? [staging, closed] : [staging];
    },
    retire: async () => {
      calls.push("retire");
    },
  };
  assert.deepEqual(await sweep(deps), { apps: 1, databases: 1 });
  assert.deepEqual(calls, ["inventory", "retire", "inventory", "delete"]);
  calls.length = 0;
  reads = 0;
  await assert.rejects(
    sweep({
      ...deps,
      retire: async () => {
        throw new Error("failed");
      },
    }),
  );
  assert.ok(!calls.includes("delete"));
  calls.length = 0;
  reads = 0;
  await assert.rejects(
    sweep({
      ...deps,
      inventory: async () =>
        ++reads === 1
          ? [staging, closed]
          : [
              {
                name: staging.name,
                machines: [{ state: "started", config: {} }],
              },
            ],
    }),
  );
  assert.ok(!calls.includes("delete"));
});
