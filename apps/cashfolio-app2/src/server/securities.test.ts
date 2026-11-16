import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  status: vi.fn(),
  search: vi.fn(),
  filters: vi.fn(),
  history: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({ handler: (fn: unknown) => fn }),
    handler: (fn: unknown) => fn,
  }),
}));
vi.mock("../users/functions.server", () => ({ ensureUser: mocks.user }));
vi.mock("../prisma.server", () => ({ prisma: {} }));
vi.mock("./securities/store.server", () => ({
  catalogueStatus: mocks.status,
  searchCatalogue: mocks.search,
  filterOptions: mocks.filters,
}));
vi.mock("./securities/history.server", () => ({
  securityHistory: mocks.history,
}));
import {
  getSecuritiesCatalogue,
  getSecuritiesFilterOptions,
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
  const scope = { version: "v", criteria: { query: "", exchange: null } };
  for (const call of [
    () => getSecuritiesCatalogue(),
    () => getSecuritiesFilterOptions({ data: scope }),
    () => getSecurityHistory({ data: { version: "v", id: "listing" } }),
    () =>
      searchSecurities({
        data: { ...scope, offset: 0, limit: 20, filters: {}, sorts: [] },
      }),
  ])
    await expect(call()).rejects.toBe(forbidden);
  for (const fn of [mocks.status, mocks.search, mocks.filters, mocks.history])
    expect(fn).not.toHaveBeenCalled();
});
test("authenticated catalogue access is shared independently of book identity", async () => {
  mocks.status.mockResolvedValue({ version: "shared" });
  expect(await getSecuritiesCatalogue()).toEqual({ version: "shared" });
  expect(mocks.status).toHaveBeenCalledWith({});
});
