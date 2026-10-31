import { expect, test, vi } from "vitest";
import { handleGainsLossesDoubleClick } from "./-gains-losses-double-click";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";

const account: GainsLossesBreakdownNode = {
  id: "gain-loss-account:usd",
  label: "USD Account",
  realizedGainLoss: 10,
  unrealizedGainLoss: 0,
  totalGainLoss: 10,
  children: [],
  account: {
    id: "usd",
    assetClass: "EQUITIES",
    kind: "account",
    explanation: null,
    legacyScopes: [],
    sources: ["HOLDING"],
    instrumentLabel: "USD",
    calculatedRealizedGainLoss: 10,
    calculatedUnrealizedGainLoss: 0,
    recordedGainLoss: 0,
  },
};
const unit: GainsLossesBreakdownNode = {
  ...account,
  id: "gain-loss-investment:EQUITIES:CURRENCY:USD",
  label: "USD",
  account: undefined,
  children: [account],
};

test.each(["series", "container"] as const)(
  "consumes a native event across a rerender when %s handles it first",
  (first) => {
    const handledEvents = new WeakSet<Event>();
    const event = new Event("dblclick");
    const onDrill = vi.fn();
    const onOpenAccount = vi.fn();
    const initial = {
      handledEvents,
      onDrill,
      onOpenAccount,
      currentNodes: [unit],
      path: ["asset-class:EQUITIES"],
    };
    let current = initial;
    onDrill.mockImplementation((path: string[]) => {
      current = { ...initial, currentNodes: unit.children, path };
    });
    // AG Charts can retain its original callback while React's container handler
    // already sees the account rendered by the first listener's state update.
    const series = () =>
      handleGainsLossesDoubleClick({
        ...initial,
        event,
        datum: { ...unit, isDrillable: true },
      });
    const container = () =>
      handleGainsLossesDoubleClick({
        ...current,
        event,
        datum: {
          ...current.currentNodes[0]!,
          isDrillable: current.currentNodes[0]!.children.length > 0,
        },
      });
    if (first === "series") {
      series();
      container();
    } else {
      container();
      series();
    }
    expect(onDrill).toHaveBeenCalledExactlyOnceWith([
      "asset-class:EQUITIES",
      unit.id,
    ]);
    expect(onOpenAccount).not.toHaveBeenCalled();
    handleGainsLossesDoubleClick({
      ...current,
      event: new Event("dblclick"),
      datum: { ...account, isDrillable: false },
    });
    expect(onOpenAccount).toHaveBeenCalledExactlyOnceWith("usd");
  },
);

test("an account navigates once per native double-click, while later events remain independent", () => {
  const handledEvents = new WeakSet<Event>();
  const onOpenAccount = vi.fn();
  const onDrill = vi.fn();
  const args = {
    handledEvents,
    onOpenAccount,
    onDrill,
    currentNodes: [account],
    path: ["asset-class:EQUITIES", unit.id],
    datum: { ...account, isDrillable: false },
  };
  for (const expectedCalls of [1, 2]) {
    const event = new Event("dblclick");
    handleGainsLossesDoubleClick({ ...args, event });
    handleGainsLossesDoubleClick({ ...args, event });
    expect(onOpenAccount).toHaveBeenCalledTimes(expectedCalls);
  }
  expect(onDrill).not.toHaveBeenCalled();
});

test("ignores stale data, non-account leaves, and already drilled groups", () => {
  const args = {
    handledEvents: new WeakSet<Event>(),
    onOpenAccount: vi.fn(),
    onDrill: vi.fn(),
    path: [unit.id],
  };
  for (const currentNodes of [[], [{ ...unit, children: [] }], [unit]]) {
    handleGainsLossesDoubleClick({
      ...args,
      currentNodes,
      event: new Event("dblclick"),
      datum: { ...unit, isDrillable: true },
    });
  }
  expect(args.onOpenAccount).not.toHaveBeenCalled();
  expect(args.onDrill).not.toHaveBeenCalled();
});
