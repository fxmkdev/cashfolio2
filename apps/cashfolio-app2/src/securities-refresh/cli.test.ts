import { afterEach, beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  preflight: vi.fn(),
  countries: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: vi.fn(function () {
    return {};
  }),
}));
vi.mock("../.prisma-client/client", () => ({
  PrismaClient: vi.fn(function () {
    return { $disconnect: mocks.disconnect };
  }),
}));
vi.mock("./refresh.server", () => ({ refreshCatalogue: mocks.refresh }));
vi.mock("./preflight.server", () => ({
  marketstackPreflight: mocks.preflight,
}));
vi.mock("../server/securities/marketstack.server", () => ({
  fetchExchangeCountries: mocks.countries,
}));
const argv = process.argv;
const exitCode = process.exitCode;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
  vi.stubEnv("MARKETSTACK_API_KEY", undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.preflight.mockResolvedValue(undefined);
  mocks.countries.mockResolvedValue(new Map());
  process.exitCode = undefined;
});
afterEach(() => {
  process.argv = argv;
  process.exitCode = exitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
test("the deployed initialization CLI delegates readiness before preflight, without provider credentials", async () => {
  process.argv = ["node", "refresh.mjs", "--if-missing"];
  mocks.refresh.mockResolvedValue({
    status: "skipped",
    reason: "catalogue-present",
    version: "v",
    rows: 31,
    pages: 0,
  });
  await import("./cli.server");
  expect(mocks.refresh).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      onlyIfMissing: true,
      prepare: expect.any(Function),
    }),
  );
  expect(mocks.preflight).not.toHaveBeenCalled();
  expect(mocks.countries).not.toHaveBeenCalled();
  expect(process.exitCode).toBeUndefined();
  expect(mocks.disconnect).toHaveBeenCalledTimes(1);
});
test("normal refresh prepares the provider only when the locked worker invokes it", async () => {
  process.argv = ["node", "refresh.mjs"];
  const signal = new AbortController().signal;
  mocks.refresh.mockImplementation(async (_db, options) => {
    await options.prepare(signal);
    return { status: "completed", rows: 31, pages: 1, version: "v" };
  });
  await import("./cli.server");
  expect(mocks.preflight).toHaveBeenCalledWith(
    expect.objectContaining({ signal }),
  );
  expect(mocks.countries).toHaveBeenCalledTimes(1);
  expect(mocks.refresh).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ onlyIfMissing: false }),
  );
});
test("smoke-only mode retains its two-call preflight without refreshing", async () => {
  process.argv = ["node", "refresh.mjs", "--smoke"];
  await import("./cli.server");
  expect(mocks.preflight).toHaveBeenCalledTimes(1);
  expect(mocks.countries).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
test("initialization failures exit unsuccessfully with safe output and disconnect", async () => {
  process.argv = ["node", "refresh.mjs", "--if-missing"];
  mocks.refresh.mockRejectedValue(new Error("private-test-credential"));
  await import("./cli.server");
  expect(process.exitCode).toBe(1);
  expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "private-test-credential",
  );
});
