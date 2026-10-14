import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "../.prisma-client/client";
import { UserRole } from "../.prisma-client/enums";

const auth = vi.hoisted(() => ({
  admin: vi.fn(),
  user: vi.fn(),
  authenticated: vi.fn(),
  deleteLogto: vi.fn(),
  getLogto: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn() {
    let validate = (data: unknown) => data;
    const chain = {
      validator(fn: typeof validate) {
        validate = fn;
        return chain;
      },
      handler(fn: (input: { data: unknown }) => unknown) {
        return (input: { data: unknown }) =>
          fn({ data: validate(input?.data) });
      },
    };
    return chain;
  },
}));
vi.mock("../users/functions.server", () => ({
  ensureUserHasRole: auth.admin,
  ensureUser: auth.user,
}));
vi.mock("../auth/functions.server", () => ({
  ensureAuthenticated: auth.authenticated,
}));
vi.mock("../auth/logto.server", () => ({ destroyLogtoSession: auth.session }));
vi.mock("../auth/logto-management.server", () => ({
  deleteLogtoUser: auth.deleteLogto,
  getLogtoUser: auth.getLogto,
  getLogtoUsers: vi.fn(),
}));
vi.mock("../security/same-origin.server", () => ({
  ensureSameOriginRequest: vi.fn(),
  ensureSameOriginRequestFromServerContext: vi.fn(),
}));
vi.mock("./account-deletion-redis", () => ({
  deleteBookScopedRedisDataForAccountBooks: vi.fn(),
}));

const run = promisify(execFile);
const adminUrl = new URL(
  process.env.MUTATION_TEST_ADMIN_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5433/postgres",
);
if (
  !["postgresql:", "postgres:"].includes(adminUrl.protocol) ||
  !["127.0.0.1", "localhost", "postgres"].includes(adminUrl.hostname) ||
  adminUrl.pathname !== "/postgres" ||
  [...adminUrl.searchParams.keys()].some((key) => key !== "schema")
) {
  throw new Error(
    "Admin mutation tests require a local postgres maintenance database without routing options.",
  );
}
const databaseName = `admin_mutation_test_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl.href }),
});
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl.href }),
});
let applicationDb: PrismaClient | undefined;
let created = false;
let users: typeof import("./admin-users");
let deletion: typeof import("./account-deletion.server");
let boundary: typeof import("./admin-mutation.server");

function demote(actor: string, target: string) {
  auth.admin.mockResolvedValueOnce({ id: actor });
  return users.updateAdminUserRoles({ data: { userId: target, roles: [] } });
}
function remove(actor: string, target: string) {
  auth.admin.mockResolvedValueOnce({ id: actor });
  return users.deleteAdminUser({
    data: { userId: target, confirmation: `${target}@example.test` },
  });
}
function selfDelete(target: string) {
  auth.authenticated.mockResolvedValueOnce({ claims: { sub: target } });
  return deletion.deleteAuthenticatedAccount();
}
async function activeAdminIds() {
  return (
    await db.user.findMany({
      where: { roles: { has: UserRole.ADMIN }, deletionPending: false },
      orderBy: { id: "asc" },
    })
  ).map((user) => user.id);
}

/** Pause the first operation after its lock and observe the second waiting in PG. */
async function race(
  first: () => Promise<unknown>,
  second: () => Promise<unknown>,
) {
  let acquired!: () => void;
  const locked = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = boundary.withAdminMutation;
  const spy = vi
    .spyOn(boundary, "withAdminMutation")
    .mockImplementationOnce((operation) =>
      original(async (tx) => {
        acquired();
        await gate;
        return operation(tx);
      }),
    );
  const firstResult = first();
  let results: Promise<PromiseSettledResult<unknown>[]> = Promise.allSettled([
    firstResult,
  ]);
  try {
    await Promise.race([locked, firstResult]);
    const secondResult = second();
    results = Promise.allSettled([firstResult, secondResult]);
    await expect
      .poll(async () => {
        const [row] = await db.$queryRaw<
          { waiting: boolean }[]
        >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%pg_advisory_xact_lock%') AS waiting`;
        return row.waiting;
      })
      .toBe(true);
    release();
    return await results;
  } finally {
    release();
    await results;
    spy.mockRestore();
  }
}

describe("last Admin invariants against disposable PostgreSQL", () => {
  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    created = true;
    await run("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: databaseUrl.href },
      maxBuffer: 4 * 1024 * 1024,
    });
    process.env.DATABASE_URL = databaseUrl.href;
    applicationDb = (await import("../prisma.server")).prisma;
    boundary = await import("./admin-mutation.server");
    users = await import("./admin-users");
    deletion = await import("./account-deletion.server");
  });
  beforeEach(async () => {
    vi.resetAllMocks();
    await db.user.deleteMany();
    await db.accountBook.deleteMany();
    await db.user.createMany({
      data: ["a", "b"].map((id) => ({
        id,
        externalId: id,
        roles: [UserRole.ADMIN],
      })),
    });
    auth.admin.mockResolvedValue({ id: "a" });
    auth.getLogto.mockImplementation(async (id: string) => ({
      id,
      primaryEmail: `${id}@example.test`,
      name: id,
      username: null,
      avatar: null,
    }));
    auth.deleteLogto.mockResolvedValue(undefined);
  });
  afterAll(async () => {
    await Promise.all([db.$disconnect(), applicationDb?.$disconnect()]);
    if (created)
      await admin.$executeRawUnsafe(
        `DROP DATABASE "${databaseName}" WITH (FORCE)`,
      );
    await admin.$disconnect();
  });

  it("rejects a waiting actor after the other Admin demotes them", async () => {
    const outcomes = await race(
      () => demote("a", "b"),
      () => demote("b", "a"),
    );
    expect(outcomes[0].status).toBe("fulfilled");
    expect(outcomes[1]).toMatchObject({
      status: "rejected",
      reason: { status: 403 },
    });
    expect(await activeAdminIds()).toEqual(["a"]);
  });
  it("rejects simultaneous opposite deletions before deleting the remaining identity", async () => {
    const outcomes = await race(
      () => remove("a", "b"),
      () => remove("b", "a"),
    );
    expect(outcomes[0].status).toBe("fulfilled");
    expect(outcomes[1]).toMatchObject({
      status: "rejected",
      reason: { status: 403 },
    });
    expect(auth.deleteLogto).toHaveBeenCalledExactlyOnceWith("b");
    expect(await activeAdminIds()).toEqual(["a"]);
  });
  it("rejects deletion by an actor demoted by the preceding request", async () => {
    const outcomes = await race(
      () => demote("a", "b"),
      () => remove("b", "a"),
    );
    expect(outcomes[1]).toMatchObject({
      status: "rejected",
      reason: { status: 403 },
    });
    expect(auth.deleteLogto).not.toHaveBeenCalled();
    expect(await activeAdminIds()).toEqual(["a"]);
  });
  it("protects self-service deletion after a concurrent demotion leaves one Admin", async () => {
    const outcomes = await race(
      () => demote("a", "b"),
      () => selfDelete("a"),
    );
    expect(outcomes[1]).toMatchObject({
      status: "rejected",
      reason: { message: expect.stringContaining("Appoint another Admin") },
    });
    expect(auth.deleteLogto).not.toHaveBeenCalled();
    expect(await activeAdminIds()).toEqual(["a"]);
  });
  it("rejects role changes to a user whose self-service deletion was reserved first", async () => {
    const outcomes = await race(
      () => selfDelete("b"),
      () => demote("a", "b"),
    );
    expect(outcomes[1].status).toBe("rejected");
    expect(await activeAdminIds()).toEqual(["a"]);
  });
  it("allows only one of two concurrent self-service Admin deletions", async () => {
    const outcomes = await race(
      () => selfDelete("a"),
      () => selfDelete("b"),
    );
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(await activeAdminIds()).toEqual(["b"]);
    expect(auth.deleteLogto).toHaveBeenCalledExactlyOnceWith("a");
  });
  it("keeps a failed identity deletion reserved and supports retry", async () => {
    auth.deleteLogto.mockRejectedValueOnce(new Error("Logto unavailable"));
    await expect(remove("a", "b")).rejects.toThrow("Logto unavailable");
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: "b" } })).deletionPending,
    ).toBe(true);
    await expect(demote("a", "b")).rejects.toThrow(
      "Account deletion is pending",
    );
    await expect(selfDelete("a")).rejects.toThrow("At least one Admin");
    expect(await activeAdminIds()).toEqual(["a"]);
    await remove("a", "b");
    expect(await db.user.findUnique({ where: { id: "b" } })).toBeNull();
  });
  it("retains the reservation if database cleanup fails after Logto deletion", async () => {
    const original = boundary.withAdminMutation;
    const spy = vi
      .spyOn(boundary, "withAdminMutation")
      .mockImplementationOnce(original)
      .mockImplementationOnce((operation) =>
        original(async (tx) => {
          const result = await operation(tx);
          // Fail after cleanup writes to verify a real PostgreSQL rollback.
          await tx.$queryRaw`SELECT 1 / 0`;
          return result;
        }),
      );
    try {
      await expect(remove("a", "b")).rejects.toThrow("division by zero");
    } finally {
      spy.mockRestore();
    }
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: "b" } })).deletionPending,
    ).toBe(true);
    expect(auth.deleteLogto).toHaveBeenCalledExactlyOnceWith("b");
    auth.getLogto.mockResolvedValue(null); // Logto already deleted; confirm by external ID.
    await users.deleteAdminUser({ data: { userId: "b", confirmation: "b" } });
    expect(await db.user.findUnique({ where: { id: "b" } })).toBeNull();
  });
  it("supports simultaneous idempotent retries of a pending deletion", async () => {
    await db.user.update({
      where: { id: "b" },
      data: { deletionPending: true },
    });
    const outcomes = await race(
      () => remove("a", "b"),
      () => remove("a", "b"),
    );
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    expect(await db.user.findUnique({ where: { id: "b" } })).toBeNull();
    expect(await activeAdminIds()).toEqual(["a"]);
  });
  it("preserves deletion of non-Admins and Logto-only users", async () => {
    await db.user.update({ where: { id: "b" }, data: { roles: [] } });
    auth.getLogto.mockResolvedValue(null);
    await users.deleteAdminUser({ data: { userId: "b", confirmation: "b" } });
    await selfDelete("logto-only");
    expect(auth.deleteLogto.mock.calls).toEqual([["b"], ["logto-only"]]);
    expect(await activeAdminIds()).toEqual(["a"]);
  });
  it("returns a readable conflict for final-Admin self-service deletion", async () => {
    await db.user.update({ where: { id: "b" }, data: { roles: [] } });
    auth.authenticated.mockResolvedValue({ claims: { sub: "a" } });
    const response = await deletion.handleAccountDeletionRequest(
      new Request("https://example.test/account/delete", { method: "POST" }),
    );
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("Appoint another Admin");
    expect(auth.deleteLogto).not.toHaveBeenCalled();
    expect(auth.session).not.toHaveBeenCalled();
  });
});
