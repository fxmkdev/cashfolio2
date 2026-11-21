import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  exchanges: vi.fn(),
  search: vi.fn(),
  history: vi.fn(),
  metadata: vi.fn(),
  restore: vi.fn(),
  update: vi.fn(),
  origin: vi.fn(),
}));
vi.mock("@/prisma.server", () => ({
  prisma: { user: { update: mocks.update } },
}));
vi.mock("@/security/same-origin.server", () => ({
  ensureSameOriginRequestFromServerContext: mocks.origin,
}));
vi.mock("./securities/restore.server", () => ({
  restoreSecurity: mocks.restore,
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
  resolveSecuritySelection,
  getSecuritiesPreference,
  updateSecuritiesPreference,
  getSecuritiesExchanges,
  getSecurityHistory,
  searchSecurities,
} from "./securities";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "user", securitiesExchangeMic: null });
  mocks.origin.mockImplementation(() => {});
});
test("all reference-data operations require an authenticated active user", async () => {
  const forbidden = new Response("Forbidden", { status: 403 });
  mocks.user.mockRejectedValue(forbidden);
  const scope = { criteria: { query: "", exchange: null } };
  for (const call of [
    () => getSecuritiesExchanges(),
    () => getSecuritiesPreference(),
    () => updateSecuritiesPreference({ data: { exchange: null } }),
    () => resolveSecuritySelection({ data: { symbol: "A", mic: "XNAS" } }),
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
    mocks.restore,
    mocks.update,
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

test("preference ownership comes from the active user across books", async () => {
  mocks.user.mockResolvedValue({ id: "first", securitiesExchangeMic: "XNAS" });
  expect(await getSecuritiesPreference()).toEqual({ exchange: "XNAS" });
  await updateSecuritiesPreference({ data: { exchange: "XSWX" } });
  expect(mocks.update).toHaveBeenLastCalledWith({
    where: { id: "first" },
    data: { securitiesExchangeMic: "XSWX" },
  });
  mocks.user.mockResolvedValue({ id: "second", securitiesExchangeMic: null });
  expect(await getSecuritiesPreference()).toEqual({ exchange: null });
  await updateSecuritiesPreference({ data: { exchange: null } });
  expect(mocks.update).toHaveBeenLastCalledWith({
    where: { id: "second" },
    data: { securitiesExchangeMic: null },
  });
});
test("cross-origin preference writes cannot reach persistence", async () => {
  mocks.origin.mockImplementation(() => {
    throw new Error("Cross origin");
  });
  await expect(
    updateSecuritiesPreference({ data: { exchange: "XNAS" } }),
  ).rejects.toThrow("Cross origin");
  expect(mocks.update).not.toHaveBeenCalled();
});
test("selection resolution authorizes before delegating to the bounded lookup", async () => {
  mocks.restore.mockResolvedValue(null);
  expect(
    await resolveSecuritySelection({
      data: { symbol: " BRK B ", mic: "XNYS" },
    }),
  ).toBeNull();
  expect(mocks.restore).toHaveBeenCalledWith({
    symbol: " BRK B ",
    mic: "XNYS",
  });
});
