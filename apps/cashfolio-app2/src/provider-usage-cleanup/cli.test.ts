import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  cleanup: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("../.prisma-client/client", () => ({
  PrismaClient: class {
    $disconnect = mocks.disconnect;
    constructor() {
      mocks.create();
    }
  },
}));
vi.mock("./store", () => ({ createCleanupStore: vi.fn() }));
vi.mock("./run", () => ({
  CLEANUP_LOG_PREFIX: "PROVIDER_USAGE_CLEANUP ",
  cleanupProviderUsage: mocks.cleanup,
}));
const originalExitCode = process.exitCode;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://user:secret@localhost/test");
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = undefined;
});
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("disconnects after successful cleanup", async () => {
  await import("./cli");
  expect(mocks.cleanup).toHaveBeenCalledOnce();
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(process.exitCode).toBeUndefined();
});

test("disconnects and fails without logging sensitive database errors", async () => {
  mocks.cleanup.mockRejectedValueOnce(
    new Error("postgresql://user:secret@localhost/test"),
  );
  await import("./cli");
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(process.exitCode).toBe(1);
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "secret",
  );
});

test("fails when disconnect fails", async () => {
  mocks.disconnect.mockRejectedValueOnce(new Error("secret"));
  await import("./cli");
  expect(process.exitCode).toBe(1);
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "secret",
  );
});

test("missing configuration fails without creating a database client", async () => {
  vi.stubEnv("DATABASE_URL", undefined);
  await import("./cli");
  expect(mocks.create).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
});
