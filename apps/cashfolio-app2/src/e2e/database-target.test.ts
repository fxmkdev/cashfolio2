import { afterEach, beforeEach, expect, it, vi } from "vitest";

const executeRaw = vi.hoisted(() => vi.fn());
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("../.prisma-client/client", () => ({
  PrismaClient: class {
    $executeRaw = executeRaw;
  },
}));

beforeEach(() => {
  vi.resetModules();
  executeRaw.mockReset();
  vi.stubEnv("APP_ENVIRONMENT", "e2e");
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@127.0.0.1:5433/postgres",
  );
});
afterEach(() => vi.unstubAllEnvs());

it.each([undefined, "prod", "production", "staging", "preview"])(
  "rejects database writes outside the E2E environment: %s",
  async (environment) => {
    vi.stubEnv("APP_ENVIRONMENT", environment);
    await expect(import("../../e2e/support/db-client")).rejects.toThrow(
      "APP_ENVIRONMENT is not set to e2e",
    );
    expect(executeRaw).not.toHaveBeenCalled();
  },
);

it.each([
  "postgresql://postgres:secret@db.example.com/cashfolio_e2e",
  "postgresql://postgres:secret@127.0.0.1.example.com/postgres",
  "postgresql://postgres:secret@localhost/production",
  "postgresql://postgres:secret@localhost/contest",
])("rejects an unsafe database target: %s", async (url) => {
  vi.stubEnv("DATABASE_URL", url);
  const load = import("../../e2e/support/db-client");
  await expect(load).rejects.toThrow("Refusing e2e DB writes for DATABASE_URL");
  await expect(load).rejects.not.toThrow("secret");
  expect(executeRaw).not.toHaveBeenCalled();
});

it.each([
  "postgresql://postgres:postgres@127.0.0.1:5433/postgres",
  "postgresql://postgres:postgres@localhost/cashfolio",
  "postgresql://postgres:postgres@postgres/cashfolio_e2e",
  "postgresql://postgres:postgres@localhost/test-cashfolio",
])("allows reset against an approved E2E target: %s", async (url) => {
  vi.stubEnv("DATABASE_URL", url);
  const { resetDatabase } = await import("../../e2e/support/db-client");
  await resetDatabase();
  expect(executeRaw).toHaveBeenCalledOnce();
});

it("rechecks the environment before resetting the database", async () => {
  const { resetDatabase } = await import("../../e2e/support/db-client");
  vi.stubEnv("APP_ENVIRONMENT", "staging");
  await expect(resetDatabase()).rejects.toThrow("APP_ENVIRONMENT");
  expect(executeRaw).not.toHaveBeenCalled();
});
