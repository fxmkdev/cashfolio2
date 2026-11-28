import { describe, expect, it, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { getHistoryDataSelection } from "./-data-selection";
import { parseHistorySearch } from "./-page-types";

describe("History router data identity", () => {
  it("retains the loader key across aggregate views and reloads on invalidation or a concrete scope", async () => {
    const loader = vi.fn(() => ({ reloadKey: "test-key" }));
    const root = createRootRoute();
    const route = createRoute({
      getParentRoute: () => root,
      path: "/$accountBookId/history",
      validateSearch: parseHistorySearch,
      loaderDeps: ({ search }) => getHistoryDataSelection(search),
      loader,
    });
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ["/book/history"] }),
      isServer: false,
      origin: "http://localhost",
    });
    await router.load();
    expect(loader).toHaveBeenCalledOnce();
    for (const metric of [
      "income",
      "expenses",
      "assets",
      "liabilities",
      "netWorth",
      "totalReturn",
    ] as const)
      await router.navigate({
        to: "/$accountBookId/history",
        params: { accountBookId: "book" },
        search: { metric },
      });
    expect(loader).toHaveBeenCalledOnce();
    await router.invalidate();
    expect(loader).toHaveBeenCalledTimes(2);
    await router.navigate({
      to: "/$accountBookId/history",
      params: { accountBookId: "book" },
      search: { metric: "income", incomeScope: "account:income" },
    });
    expect(loader).toHaveBeenCalledTimes(3);
  });
});
