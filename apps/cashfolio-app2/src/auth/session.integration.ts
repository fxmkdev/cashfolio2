import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "../.prisma-client/client";
import { SESSION_COOKIE, hashSessionToken } from "./session-policy";
import { hashAuthSubject } from "./subject-revocation.server";
import {
  closeTestProviders,
  createTestProvider,
  makeIdToken,
  providerEndpoint,
} from "./logto-test-provider";

const requestContext = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
}));
const deleteLogtoUser = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (name: string) =>
    name === "__Host-cashfolio-session" ? requestContext.cookie : undefined,
  setCookie: (name: string, value: string) => {
    if (name === "__Host-cashfolio-session")
      requestContext.cookie = value || undefined;
  },
}));
vi.mock("./logto-management.server", () => ({ deleteLogtoUser }));
vi.mock("../server/user-deletion-redis", () => ({
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
    "Session integration tests require a local postgres maintenance database without routing options.",
  );
}
const databaseName = `auth_session_test_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl.href }),
});
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl.href }),
});
let applicationDb: PrismaClient | undefined;
let store: typeof import("./session-store.server");
let logto: typeof import("./logto.server");
let deletion: typeof import("../server/user-deletion.server");
let created = false;
let previousSchemaDirectory: string | undefined;
let backfilledSubjects: string[];
let provider: ReturnType<typeof createTestProvider>;

beforeAll(async () => {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  created = true;
  const migrationName = "20261028193000_add_auth_subject_revocations";
  previousSchemaDirectory = await mkdtemp(
    join(tmpdir(), "auth-subject-migration-"),
  );
  await cp("prisma", previousSchemaDirectory, {
    recursive: true,
    filter: (source) =>
      !source
        .split(/[\\/]/)
        .some((part) => /^\d{14}_/.test(part) && part >= migrationName),
  });
  await run(
    "pnpm",
    [
      "exec",
      "prisma",
      "migrate",
      "deploy",
      "--schema",
      join(previousSchemaDirectory, "schema.prisma"),
    ],
    {
      env: { ...process.env, DATABASE_URL: databaseUrl.href },
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  await db.user.createMany({
    data: [
      {
        id: "migration-pending",
        externalId: "pending-identity-ü",
        deletionPending: true,
      },
      { id: "migration-active", externalId: "active-identity" },
    ],
  });
  await run("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl.href },
    maxBuffer: 4 * 1024 * 1024,
  });
  backfilledSubjects = (await db.authSubjectRevocation.findMany()).map(
    (row) => row.subjectHash,
  );
  vi.stubEnv("DATABASE_URL", databaseUrl.href);
  vi.stubEnv("SESSION_SECRET", "integration-test-session-key");
  vi.stubEnv("LOGTO_ENDPOINT", providerEndpoint);
  vi.stubEnv("LOGTO_APP_ID", "test-app");
  vi.stubEnv("LOGTO_APP_SECRET", "test-secret");
  vi.stubEnv("BASE_URL", "https://app.example.test");
  vi.stubEnv("E2E_TEST_MODE", "false");
  applicationDb = (await import("../prisma.server")).prisma;
  store = await import("./session-store.server");
  logto = await import("./logto.server");
  deletion = await import("../server/user-deletion.server");
});
beforeEach(async () => {
  await db.authSession.deleteMany();
  await db.user.deleteMany();
  await db.authSubjectRevocation.deleteMany();
  requestContext.cookie = undefined;
  deleteLogtoUser.mockReset().mockResolvedValue(undefined);
  provider = createTestProvider();
});
afterEach(closeTestProviders);
afterAll(async () => {
  await Promise.all([db.$disconnect(), applicationDb?.$disconnect()]);
  if (created)
    await admin.$executeRawUnsafe(
      `DROP DATABASE "${databaseName}" WITH (FORCE)`,
    );
  await admin.$disconnect();
  if (previousSchemaDirectory)
    await rm(previousSchemaDirectory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

async function login() {
  const response = await logto.handleLogtoSignIn();
  const pendingToken = requestContext.cookie!;
  const state = new URL(response.headers.get("location")!).searchParams.get(
    "state",
  );
  await logto.handleLogtoSignInCallback(
    new Request(
      `https://app.example.test/api/logto/callback?state=${state}&code=code`,
    ),
  );
  return { pendingToken, token: requestContext.cookie! };
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function expectLockWait() {
  await expect
    .poll(async () => {
      const [result] = await db.$queryRaw<
        { waiting: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%pg_advisory_xact_lock%') AS waiting`;
      return result.waiting;
    })
    .toBe(true);
}

describe("session lifecycle against disposable PostgreSQL and the real Logto SDK", () => {
  it("backfills only deletion-pending subjects with the same UTF-8 hash as the application", () => {
    expect(backfilledSubjects).toEqual([hashAuthSubject("pending-identity-ü")]);
  });
  it("rotates callback credentials and denies copied cookies after logout", async () => {
    const { token, pendingToken } = await login();
    expect(token).not.toBe(pendingToken);
    expect(
      await db.authSession.findUnique({
        where: { tokenHash: hashSessionToken(pendingToken)! },
      }),
    ).toBeNull();
    const row = await db.authSession.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(token)! },
    });
    expect(row.encryptedData).not.toContain("test-refresh");
    expect((await logto.getLogtoContext()).isAuthenticated).toBe(true);
    await logto.handleLogtoSignOut(
      new Request("https://app.example.test/api/logto/sign-out", {
        method: "POST",
        headers: { origin: "https://app.example.test" },
      }),
    );
    requestContext.cookie = token;
    expect((await logto.getLogtoContext()).isAuthenticated).toBe(false);
    expect(await db.authSession.count()).toBe(0);
  });

  it("serializes competing refreshes and preserves the updated credentials", async () => {
    const { token } = await login();
    const reached = gate();
    const resume = gate();
    const first = store.withSessionLock(token, async (tx, session) => {
      reached.release();
      await resume.promise;
      const data = await store.readSessionData(session!);
      data.refreshToken = "rotated-first";
      await store.saveSession(tx, session!, data);
    });
    await reached.promise;
    const second = store.withSessionLock(
      token,
      async (_tx, session) =>
        (await store.readSessionData(session!)).refreshToken,
    );
    try {
      await expectLockWait();
    } finally {
      resume.release();
    }
    await first;
    expect(await second).toBe("rotated-first");
  });

  it("cannot restore a session when logout commits before a waiting refresh", async () => {
    const { token } = await login();
    const reached = gate();
    const resume = gate();
    const revocation = store.withSessionLock(token, async (tx, session) => {
      reached.release();
      await resume.promise;
      await store.revokeSession(tx, session);
    });
    await reached.promise;
    const waiting = store.withSessionLock(
      token,
      async (_tx, session) => session,
    );
    try {
      await expectLockWait();
    } finally {
      resume.release();
    }
    await revocation;
    expect(await waiting).toBeNull();
  });

  it("cannot restore a session deleted concurrently through its user FK", async () => {
    const { token } = await login();
    await store.withSessionLock(token, async (tx, session) => {
      await db.user.delete({ where: { id: session!.userId! } });
      expect(
        await store.saveSession(tx, session!, { idToken: makeIdToken() }),
      ).toBe(false);
    });
    requestContext.cookie = token;
    expect((await logto.getLogtoContext()).isAuthenticated).toBe(false);
    expect(await db.user.count()).toBe(0);
  });

  it("restricts all sessions during failed deletion, supports retry, and cascades every credential", async () => {
    const { token } = await login();
    const user = await db.user.findUniqueOrThrow({
      where: { externalId: "external-1" },
    });
    const other = await store.withSessionLock(undefined, (tx) =>
      store.createSession(
        tx,
        { idToken: makeIdToken(), refreshToken: "refresh" },
        user.id,
      ),
    );
    deleteLogtoUser.mockRejectedValueOnce(
      new Error("temporary identity failure"),
    );
    await expect(deletion.deleteAuthenticatedUser()).rejects.toThrow(
      "temporary identity failure",
    );
    const marker = await db.authSubjectRevocation.findUniqueOrThrow({
      where: { subjectHash: hashAuthSubject("external-1") },
    });
    expect((await logto.getLogtoContext()).isAuthenticated).toBe(false);
    requestContext.cookie = other.token;
    expect((await logto.getLogtoContext()).isAuthenticated).toBe(false);
    requestContext.cookie = token;
    await deletion.deleteAuthenticatedUser();
    expect(await db.authSession.count()).toBe(0);
    expect(await db.user.count()).toBe(0);
    expect(
      await db.authSubjectRevocation.findUnique({
        where: { subjectHash: marker.subjectHash },
      }),
    ).toEqual(marker);
    for (const savedCookie of [token, other.token]) {
      requestContext.cookie = savedCookie;
      expect((await logto.getLogtoContext()).isAuthenticated).toBe(false);
    }
    expect(await db.user.count()).toBe(0);
    expect(SESSION_COOKIE).toBe("__Host-cashfolio-session");
  });

  it("rejects a callback whose valid exchange overlaps completed deletion", async () => {
    await login();
    requestContext.cookie = undefined;
    const pending = await startCallback("late-code");
    const exchanged = gate();
    const resume = gate();
    provider.options.afterTokenExchange = async () => {
      exchanged.release();
      await resume.promise;
    };
    const callback = logto.handleLogtoSignInCallback(pending.request);
    const outcome = Promise.allSettled([callback]);
    await exchanged.promise;
    try {
      await deletion.deleteUserData({ externalId: "external-1" });
      expect(await db.user.count()).toBe(0);
    } finally {
      resume.release();
    }
    expect((await outcome)[0]).toMatchObject({
      status: "rejected",
      reason: { status: 400 },
    });
    expect(await db.user.count()).toBe(0);
    expect(await db.authSession.count()).toBe(0);
    expect(await db.authSubjectRevocation.count()).toBe(1);
    requestContext.cookie = pending.token;
    expect((await logto.getLogtoContext()).isAuthenticated).toBe(false);
  });

  it("lets a provisioning callback commit before a waiting deletion revokes it", async () => {
    const pending = await startCallback("first-code");
    const subjects = await import("./subject-revocation.server");
    const original = subjects.provisionCallbackUser;
    const reached = gate();
    const resume = gate();
    const spy = vi
      .spyOn(subjects, "provisionCallbackUser")
      .mockImplementationOnce(async (...args) => {
        const user = await original(...args);
        reached.release();
        await resume.promise;
        return user;
      });
    const callback = logto.handleLogtoSignInCallback(pending.request);
    await reached.promise;
    const removal = deletion.deleteUserData({ externalId: "external-1" });
    const outcomes = Promise.allSettled([callback, removal]);
    try {
      await expectLockWait();
    } finally {
      resume.release();
      spy.mockRestore();
    }
    expect(await outcomes).toMatchObject([
      { status: "fulfilled", value: { status: 302 } },
      { status: "fulfilled" },
    ]);
    expect(await db.user.count()).toBe(0);
    expect(await db.authSession.count()).toBe(0);
    expect(await db.authSubjectRevocation.count()).toBe(1);
  });

  it("provisions one User for simultaneous callbacks with different single-use codes and bearers", async () => {
    provider.options.singleUseCodes = true;
    const callbacks = [];
    for (let index = 0; index < 5; index++) {
      requestContext.cookie = undefined;
      callbacks.push(await startCallback(`first-login-${index}`));
    }
    const results = await Promise.all(
      callbacks.map(({ token, request }) => {
        requestContext.cookie = token;
        return logto.handleLogtoSignInCallback(request);
      }),
    );
    expect(results.every((response) => response.status === 302)).toBe(true);
    expect(await db.user.count()).toBe(1);
    expect(
      await db.authSession.count({ where: { userId: { not: null } } }),
    ).toBe(5);
    expect(provider.tokenRequests.map((r) => r.code).sort()).toEqual(
      callbacks.map((_, index) => `first-login-${index}`),
    );
  });

  it("keeps a Logto-only revocation while allowing an unrelated subject to sign in", async () => {
    await deletion.deleteUserData({ externalId: "external-1" });
    await expect(login()).rejects.toMatchObject({ status: 400 });
    expect(await db.user.count()).toBe(0);
    provider.options.subject = "another-subject";
    await login();
    expect((await logto.getLogtoContext()).isAuthenticated).toBe(true);
    expect(await db.user.count()).toBe(1);
    expect(await db.authSubjectRevocation.count()).toBe(1);
  });

  it("commits refresh recovery after JWKS failure without extending session deadlines", async () => {
    provider.options.rotateRefreshTokens = true;
    const { token } = await login();
    await store.withSessionLock(token, async (tx, session) => {
      const data = await store.readSessionData(session!);
      data.idToken = makeIdToken(-120);
      await store.saveSession(tx, session!, data, false, false);
    });
    const before = await db.authSession.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(token)! },
    });
    provider.options.jwksUnavailable = true;
    await expect(logto.getLogtoContext()).rejects.toMatchObject({
      status: 503,
    });
    const recovered = await db.authSession.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(recovered.idleExpiresAt).toEqual(before.idleExpiresAt);
    expect(recovered.expiresAt).toEqual(before.expiresAt);
    await store.withSessionLock(token, async (_tx, session) => {
      const data = await store.readSessionData(session!);
      expect(data.refreshToken).toBe("test-refresh-2");
      expect(data.accessToken).toBeUndefined();
      expect(data.idToken).toBe(
        (
          await store.readSessionData({
            ...session!,
            encryptedData: before.encryptedData,
          })
        ).idToken,
      );
    });
    provider.options.jwksUnavailable = false;
    expect((await logto.getLogtoContext()).isAuthenticated).toBe(true);
    expect(provider.tokenRequests.slice(1).map((r) => r.refreshToken)).toEqual([
      "test-refresh-1",
      "test-refresh-2",
    ]);
  });
});

async function startCallback(code: string) {
  const response = await logto.handleLogtoSignIn();
  const token = requestContext.cookie!;
  const state = new URL(response.headers.get("location")!).searchParams.get(
    "state",
  );
  return {
    token,
    request: new Request(
      `https://app.example.test/api/logto/callback?state=${state}&code=${code}`,
    ),
  };
}
