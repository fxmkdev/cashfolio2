import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  exchanges: vi.fn(),
  search: vi.fn(),
  history: vi.fn(),
  metadata: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({ handler: (fn: unknown) => fn }),
    handler: (fn: unknown) => fn,
  }),
}));
vi.mock("../users/functions.server", () => ({ ensureUser: mocks.user }));
vi.mock("./securities/discovery.server", () => ({
  exchangeDirectory: mocks.exchanges,
  searchListings: mocks.search,
}));
vi.mock("./securities/history.server", () => ({
  securityHistory: mocks.history,
}));
vi.mock("./securities/metadata.server", () => ({
  securityMetadata: mocks.metadata,
}));
import {
  getSecurityMetadata,
  getSecuritiesExchanges,
  getSecurityHistory,
  searchSecurities,
} from "./securities";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "user" });
});
test("all reference-data operations require an authenticated active user", async () => {
  const forbidden = new Response("Forbidden", { status: 403 });
  mocks.user.mockRejectedValue(forbidden);
  const scope = { criteria: { query: "", exchange: null } };
  for (const call of [
    () => getSecuritiesExchanges(),
    () => getSecurityHistory({ data: { selectionToken: "reference" } }),
    () => getSecurityMetadata({ data: { selectionToken: "reference" } }),
    () =>
      searchSecurities({
        data: { ...scope, offset: 0, limit: 20 },
      }),
  ])
    await expect(call()).rejects.toBe(forbidden);
  for (const fn of [
    mocks.exchanges,
    mocks.search,
    mocks.history,
    mocks.metadata,
  ])
    expect(fn).not.toHaveBeenCalled();
});
test("authenticated exchange directory access is shared independently of book identity", async () => {
  mocks.exchanges.mockResolvedValue([
    { value: "XNAS", label: "NASDAQ (XNAS)" },
  ]);
  expect(await getSecuritiesExchanges()).toEqual([
    { value: "XNAS", label: "NASDAQ (XNAS)" },
  ]);
  expect(mocks.exchanges).toHaveBeenCalledWith();
});
