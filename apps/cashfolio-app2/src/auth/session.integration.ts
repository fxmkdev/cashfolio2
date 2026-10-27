import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
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

beforeAll(async () => {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  created = true;
  await run("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl.href },
    maxBuffer: 4 * 1024 * 1024,
  });
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
  requestContext.cookie = undefined;
  deleteLogtoUser.mockReset().mockResolvedValue(undefined);
  createTestProvider();
});
afterEach(closeTestProviders);
afterAll(async () => {
  await Promise.all([db.$disconnect(), applicationDb?.$disconnect()]);
  if (created)
    await admin.$executeRawUnsafe(
      `DROP DATABASE "${databaseName}" WITH (FORCE)`,
    );
  await admin.$disconnect();
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
    expect((await logto.getLogtoContext()).isAuthenticated).toBe(false);
    requestContext.cookie = other.token;
    expect((await logto.getLogtoContext()).isAuthenticated).toBe(false);
    requestContext.cookie = token;
    await deletion.deleteAuthenticatedUser();
    expect(await db.authSession.count()).toBe(0);
    expect(await db.user.count()).toBe(0);
    for (const savedCookie of [token, other.token]) {
      requestContext.cookie = savedCookie;
      expect((await logto.getLogtoContext()).isAuthenticated).toBe(false);
    }
    expect(await db.user.count()).toBe(0);
    expect(SESSION_COOKIE).toBe("__Host-cashfolio-session");
  });
});
