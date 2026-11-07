import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  GridApi,
  GridReadyEvent,
  SelectionChangedEvent,
} from "ag-grid-enterprise";
import { notifications } from "@mantine/notifications";
import { getAccountReferenceBalances } from "@/server/accounts";
import { useAccountsReferenceBalanceRows } from "./page-reference-balances";
import { useBulkAccountActions } from "./use-bulk-account-actions";
import type { AccountsGridRow, AccountGridTreeRow } from "./page-types";
import { toAccountGridTreeRow } from "./page-types";
import { account } from "./asset-class-test-fixtures";

const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void)[],
  cleanups: [] as (() => void)[],
}));
vi.mock("@/server/accounts", () => ({ getAccountReferenceBalances: vi.fn() }));
vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));
vi.mock("react", () => {
  function memo(callback: () => unknown, deps: unknown[], evaluate: boolean) {
    const index = harness.cursor++;
    const previous = harness.slots[index] as
      { deps: unknown[]; value: unknown } | undefined;
    if (!previous || deps.some((dep, i) => dep !== previous.deps[i]))
      harness.slots[index] = { deps, value: evaluate ? callback() : callback };
    return (harness.slots[index] as { value: unknown }).value;
  }
  return {
    useState: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots))
        harness.slots[index] =
          typeof initial === "function" ? initial() : initial;
      return [
        harness.slots[index],
        (value: unknown) => {
          harness.slots[index] =
            typeof value === "function" ? value(harness.slots[index]) : value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots))
        harness.slots[index] = { current: initial };
      return harness.slots[index];
    },
    useMemo: (callback: () => unknown, deps: unknown[]) =>
      memo(callback, deps, true),
    useCallback: (callback: () => unknown, deps: unknown[]) =>
      memo(callback, deps, false),
    useEffect: (effect: () => (() => void) | void, deps: unknown[]) => {
      const index = harness.cursor++;
      const previous = harness.slots[index] as unknown[] | undefined;
      if (!previous || deps.some((dep, i) => dep !== previous[i])) {
        harness.slots[index] = deps;
        harness.effects.push(() => {
          harness.cleanups[index]?.();
          harness.cleanups[index] = effect() ?? (() => {});
        });
      }
    },
  };
});
function Render<T>(useHook: () => T) {
  harness.cursor = 0;
  const value = useHook();
  harness.effects.splice(0).forEach((effect) => effect());
  return value;
}
function RenderReference(
  args: Parameters<typeof useAccountsReferenceBalanceRows>[0],
) {
  const useTestHook = () => useAccountsReferenceBalanceRows(args);
  return Render(useTestHook);
}
function RenderBulk(args: Parameters<typeof useBulkAccountActions>[0]) {
  const useTestHook = () => useBulkAccountActions(args);
  return Render(useTestHook);
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}
function referenceArgs() {
  return {
    accountBookId: "book",
    tab: "BALANCE" as const,
    mode: "active" as const,
    referenceCurrency: "CHF",
    rows: [
      account("cash", { currency: "USD", balanceInReferenceCurrency: null }),
    ],
  };
}
function bulkArgs(rows: AccountGridTreeRow[]) {
  return {
    scopeKey: "book:BALANCE",
    enabled: true,
    rows,
    submitAssetClass: vi.fn().mockResolvedValue(undefined),
    submitTrackingMethod: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn(),
  };
}
function selectedGrid(rows: AccountGridTreeRow[]) {
  let selected = [...rows];
  const grid = {
    deselectAll: vi.fn(() => {
      selected = [];
    }),
    getSelectedRows: () => selected,
    getSelectedNodes: () => selected.map((data) => ({ data })),
    forEachNodeAfterFilter: (
      visit: (node: { data: AccountGridTreeRow }) => void,
    ) => rows.forEach((data) => visit({ data })),
    setNodesSelected: vi.fn(),
  };
  return {
    grid,
    api: grid as unknown as GridApi<AccountsGridRow>,
    select: (next: AccountGridTreeRow[]) => {
      selected = next;
    },
  };
}
function selectBulk(
  args: Parameters<typeof RenderBulk>[0],
  selected: ReturnType<typeof selectedGrid>,
) {
  const initial = RenderBulk(args);
  initial.gridProps.onGridReady!({
    api: selected.api,
  } as GridReadyEvent<AccountsGridRow>);
  initial.gridProps.onSelectionChanged!({
    api: selected.api,
  } as SelectionChangedEvent<AccountsGridRow>);
  return RenderBulk(args);
}
beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.effects = [];
  harness.cleanups = [];
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
});
afterEach(() => {
  harness.cleanups.forEach((cleanup) => cleanup());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("delays the reference loader by 100 ms and overlays the resolved balance", async () => {
  const pending = deferred<{
    rows: { id: string; balanceInReferenceCurrency: number }[];
  }>();
  vi.mocked(getAccountReferenceBalances).mockReturnValue(
    pending.promise as ReturnType<typeof getAccountReferenceBalances>,
  );
  const args = referenceArgs();
  RenderReference(args);
  RenderReference(args);
  vi.advanceTimersByTime(99);
  expect(RenderReference(args).shouldShowReferenceBalancesLoading).toBe(false);
  vi.advanceTimersByTime(1);
  expect(RenderReference(args).shouldShowReferenceBalancesLoading).toBe(true);
  pending.resolve({ rows: [{ id: "cash", balanceInReferenceCurrency: 12 }] });
  await settle();
  const result = RenderReference(args);
  expect(result.shouldShowReferenceBalancesLoading).toBe(false);
  expect(
    result.rowsWithAccountReferenceBalances[0].balanceInReferenceCurrency,
  ).toBe(12);
  expect(getAccountReferenceBalances).toHaveBeenCalledWith({
    data: { accountBookId: "book", accountState: "all", type: "BALANCE" },
  });
});

it("cancels obsolete requests across row refreshes, books, and category tabs", async () => {
  const first = deferred<{
    rows: { id: string; balanceInReferenceCurrency: number }[];
  }>();
  vi.mocked(getAccountReferenceBalances)
    .mockReturnValueOnce(
      first.promise as ReturnType<typeof getAccountReferenceBalances>,
    )
    .mockResolvedValue({
      rows: [{ id: "cash", balanceInReferenceCurrency: 20 }],
    } as Awaited<ReturnType<typeof getAccountReferenceBalances>>);
  const args = referenceArgs();
  RenderReference(args);
  const refreshed = {
    ...args,
    rows: [
      account("cash", {
        name: "Renamed",
        currency: "USD",
        balanceInReferenceCurrency: null,
      }),
    ],
  };
  RenderReference(refreshed);
  await settle();
  expect(
    RenderReference(refreshed).rowsWithAccountReferenceBalances[0]
      .balanceInReferenceCurrency,
  ).toBe(20);
  first.resolve({ rows: [{ id: "cash", balanceInReferenceCurrency: 999 }] });
  await settle();
  expect(
    RenderReference(refreshed).rowsWithAccountReferenceBalances[0]
      .balanceInReferenceCurrency,
  ).toBe(20);
  RenderReference({ ...refreshed, accountBookId: "other" });
  await settle();
  expect(getAccountReferenceBalances).toHaveBeenCalledTimes(3);
  const categories = { ...refreshed, tab: "EQUITY-INCOME" as const };
  RenderReference(categories);
  await settle();
  expect(RenderReference(categories)).toMatchObject({
    isEquityTab: true,
    shouldShowReferenceBalancesLoading: false,
  });
  expect(getAccountReferenceBalances).toHaveBeenCalledTimes(3);
});

it("settles failed requests without replacing immediate balances", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getAccountReferenceBalances).mockRejectedValue(
    new Error("offline"),
  );
  const args = { ...referenceArgs(), rows: [account("cash")] };
  RenderReference(args);
  await settle();
  expect(
    RenderReference(args).rowsWithAccountReferenceBalances[0]
      .balanceInReferenceCurrency,
  ).toBe(10);
  expect(RenderReference(args).shouldShowReferenceBalancesLoading).toBe(false);
  expect(log).toHaveBeenCalledWith(
    "Unable to load reference-currency balances for accounts tab",
    expect.any(Error),
  );
});

it("submits the frozen asset-class target after the selection changes", async () => {
  const rows = [
    toAccountGridTreeRow(account("first")),
    toAccountGridTreeRow(account("second", { isActive: false })),
  ];
  const args = bulkArgs(rows),
    selected = selectedGrid(rows);
  const actions = selectBulk(args, selected);
  expect(actions.selectedCount).toBe(2);
  actions.openAssetClass();
  selected.select([rows[1]]);
  RenderBulk(args).gridProps.onSelectionChanged!({
    api: selected.api,
  } as SelectionChangedEvent<AccountsGridRow>);
  expect(RenderBulk(args).assetClassTarget).toEqual({
    accountIds: ["first", "second"],
    archivedCount: 1,
  });
  await RenderBulk(args).applyAssetClass(null);
  expect(args.submitAssetClass).toHaveBeenCalledWith(["first", "second"], null);
  expect(args.invalidate).toHaveBeenCalledOnce();
  expect(RenderBulk(args)).toMatchObject({
    selectedCount: 0,
    assetClassTarget: undefined,
  });
  expect(notifications.show).toHaveBeenCalledWith({
    color: "green",
    message: "Asset class updated for 2 accounts.",
  });
});

it("retains the tracking target after rejection and clears it after retry or scope change", async () => {
  const rows = [
    toAccountGridTreeRow(account("cash")),
    toAccountGridTreeRow(account("crypto", { unit: "CRYPTOCURRENCY" })),
  ];
  const args = bulkArgs(rows),
    selected = selectedGrid(rows);
  selectBulk(args, selected).openTrackingMethod();
  const target = { accountIds: ["cash"], archivedCount: 0, skippedCount: 1 };
  expect(RenderBulk(args).trackingMethodTarget).toEqual(target);
  args.submitTrackingMethod.mockRejectedValueOnce(new Error("offline"));
  await expect(
    RenderBulk(args).applyTrackingMethod("TOTAL_PORTFOLIO_VALUE"),
  ).rejects.toThrow("offline");
  expect(RenderBulk(args)).toMatchObject({
    trackingMethodTarget: target,
    selectedCount: 2,
  });
  expect(args.invalidate).not.toHaveBeenCalled();
  expect(notifications.show).not.toHaveBeenCalled();
  await RenderBulk(args).applyTrackingMethod("TOTAL_PORTFOLIO_VALUE");
  expect(args.submitTrackingMethod).toHaveBeenLastCalledWith(
    ["cash"],
    "TOTAL_PORTFOLIO_VALUE",
  );
  expect(RenderBulk(args)).toMatchObject({
    trackingMethodTarget: undefined,
    selectedCount: 0,
  });
  selected.select(rows);
  selectBulk(args, selected).openAssetClass();
  const nextScope = { ...args, scopeKey: "other:BALANCE" };
  RenderBulk(nextScope);
  expect(RenderBulk(nextScope)).toMatchObject({
    selectedCount: 0,
    assetClassTarget: undefined,
    trackingMethodTarget: undefined,
  });
});
