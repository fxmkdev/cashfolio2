import assert from "node:assert/strict";
import test from "node:test";
import { databaseUrl, serializeFlySecrets } from "./runtime.ts";

test("Fly stdin serialization preserves literal JSON, punctuation and dollar signs without JSON escapes", () => {
  const target =
    '{"environment":"preview","database":"pr-42-title-cashfolio-app2"}';
  assert.equal(
    serializeFlySecrets({ SEED_TARGET: target, TOKEN: "a$b#c=d" }),
    `SEED_TARGET="""${target}"""\nTOKEN="""a$b#c=d"""\n`,
  );
  for (const value of ["line\nbreak", 'triple"""quote', 'quote"before#comment'])
    assert.throws(() => serializeFlySecrets({ TOKEN: value }));
});
test("connection URLs use only the approved destination and verified TLS", () => {
  const url = new URL(
    databaseUrl(
      {
        hostname: "ep-preview.example.neon.tech",
        database: "pr-42-title-cashfolio-app2",
        projectId: "project",
        branchId: "br-preview",
        endpointId: "ep-preview",
        role: "unused",
      },
      "cashfolio_pr_42_app",
      "a@b:c",
    ),
  );
  assert.equal(decodeURIComponent(url.password), "a@b:c");
  assert.equal(url.hostname, "ep-preview.example.neon.tech");
  assert.equal(url.pathname, "/pr-42-title-cashfolio-app2");
  assert.equal(url.searchParams.get("sslmode"), "verify-full");
});

test("provisioning refuses mismatched server identity and privileged roles before writes", async () => {
  const { verifyProvisionerServer } = await import("./runtime.ts");
  const target = {
    hostname: "ep-preview.example.neon.tech",
    database: "cashfolio_preview_control",
    projectId: "preview-project",
    branchId: "br-preview",
    endpointId: "ep-preview",
    role: "cashfolio_preview_provisioner",
  };
  const identity = {
    projectId: target.projectId,
    branchId: target.branchId,
    endpointId: target.endpointId,
    database: target.database,
    role: target.role,
  };
  for (const field of [
    "projectId",
    "branchId",
    "endpointId",
    "database",
    "role",
  ] as const) {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(sql);
        return { rows: [{ ...identity, [field]: "production" }] };
      },
    } as unknown as Parameters<typeof verifyProvisionerServer>[0];
    await assert.rejects(verifyProvisionerServer(client, target));
    assert.equal(queries.length, 1);
    assert.ok(queries.every((sql) => sql.startsWith("SELECT")));
  }
  for (const safe of [false, true]) {
    const client = {
      query: async (sql: string) => ({
        rows: sql.includes("FROM pg_roles") ? [{ safe }] : [identity],
      }),
    } as unknown as Parameters<typeof verifyProvisionerServer>[0];
    if (safe)
      await assert.doesNotReject(verifyProvisionerServer(client, target));
    else await assert.rejects(verifyProvisionerServer(client, target));
  }
});
