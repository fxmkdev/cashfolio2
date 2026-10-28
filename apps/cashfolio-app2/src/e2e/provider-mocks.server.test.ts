import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ listen: vi.fn(), close: vi.fn() }));
vi.mock("msw/node", () => ({ setupServer: () => mocks }));
import { getE2EMockedProviderApiKey } from "./provider-api-key";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("starts provider interception only once and registers shutdown", async () => {
  vi.stubEnv("E2E_TEST_MODE", "true");
  const once = vi.spyOn(process, "once");
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const { ensureE2EValuationProviderMocksEnabled } =
    await import("./provider-mocks.server");
  ensureE2EValuationProviderMocksEnabled();
  ensureE2EValuationProviderMocksEnabled();
  expect(mocks.listen).toHaveBeenCalledTimes(1);
  expect(once).toHaveBeenCalledWith("exit", expect.any(Function));
  const options = mocks.listen.mock.calls[0][0];
  expect(() =>
    options.onUnhandledRequest(
      new Request("https://api.marketstack.com/unhandled"),
    ),
  ).toThrow("Unhandled E2E valuation provider request");
  expect(() =>
    options.onUnhandledRequest(new Request("http://127.0.0.1/")),
  ).not.toThrow();
  expect(info).toHaveBeenCalledTimes(1);
});

it("provides the deterministic E2E-only API key", () => {
  expect(getE2EMockedProviderApiKey()).toBe("e2e-mocked-provider-key");
});
