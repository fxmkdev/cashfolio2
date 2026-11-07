import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, Unit } from "@/.prisma-client/enums";

const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock("react", () => ({
  useRef: (value: unknown) => {
    const index = harness.cursor++;
    harness.slots[index] ??= { current: value };
    return harness.slots[index];
  },
  useReducer: (
    reduce: (state: unknown, event: unknown) => unknown,
    initial: unknown,
  ) => {
    const index = harness.cursor++;
    harness.slots[index] ??= initial;
    return [
      harness.slots[index],
      (event: unknown) => {
        harness.slots[index] = reduce(harness.slots[index], event);
      },
    ];
  },
  useEffect: () => {},
}));
import { useTransactionWorkflow } from "./use-transaction-workflow";
import type { LoadedTransaction } from "./transaction-workflow";

function Render(scope = "book:account") {
  harness.cursor = 0;
  return useTransactionWorkflow(scope, "account");
}
function transaction(id: string): LoadedTransaction {
  return {
    id,
    description: id,
    bookings: ["account", "counter"].map((account, index) => ({
      date: "2026-01-10T00:00:00.000Z",
      account,
      description: "",
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: undefined,
      symbol: undefined,
      tradeCurrency: undefined,
      debit: index === 0 ? 10 : undefined,
      credit: index === 1 ? 10 : undefined,
    })),
  };
}
function deferred() {
  let resolve!: (value: LoadedTransaction) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<LoadedTransaction>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const conversion = {
  allAccountOptions: [
    {
      label: "Counter",
      value: "counter",
      unit: Unit.CURRENCY,
      currency: "CHF",
      type: AccountType.BALANCE,
    },
  ],
  currentAccount: {
    id: "account",
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
  },
};
beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
});

describe("ledger transaction workflows", () => {
  it("preserves simple copy drafts when switching to split and completing the old exit", async () => {
    await Render().loadTransaction(
      "copy",
      async () => transaction("copy"),
      true,
    );
    expect(Render().viewProps).toMatchObject({
      simpleModalOpened: true,
      createSimpleInitialValues: { description: "copy", amount: 10 },
    });
    Render().switchCreateToSplit(
      {
        date: "2026-02-02",
        description: "edited draft",
        counterAccountId: "counter",
        amount: 25,
        direction: "CREDIT",
      },
      conversion,
    );
    const flow = Render();
    expect(flow.viewProps).toMatchObject({
      simpleModalOpened: false,
      splitModalOpened: true,
      createSplitIsCopy: true,
      createSplitInitialValues: { description: "edited draft" },
    });
    flow.viewProps.onSimpleModalExitTransitionEnd();
    expect(Render().viewProps).toMatchObject({
      splitModalOpened: true,
      createSplitIsCopy: true,
      createSimpleInitialValues: undefined,
    });
  });

  it("keeps failed submission data and submission state independent from the exiting simple dialog", async () => {
    await Render().loadTransaction(
      "edit",
      async () => transaction("edit"),
      true,
    );
    Render().switchEditToSplit(
      {
        date: "2026-02-02",
        description: "draft",
        counterAccountId: "counter",
        amount: 20,
        direction: "DEBIT",
      },
      conversion,
    );
    Render().viewProps.onEditSubmittingChange(true);
    expect(Render().flow).toMatchObject({
      kind: "editSplit",
      submitting: true,
      transaction: { description: "draft" },
    });
    Render().viewProps.onEditSubmittingChange(false);
    expect(Render().viewProps).toMatchObject({
      editModalOpened: true,
      editingTransactionData: { id: "edit", description: "draft" },
    });

    Render().openCreate(true);
    Render().switchCreateToSplit(
      {
        date: "2026-02-02",
        description: "new",
        counterAccountId: "counter",
        amount: 20,
        direction: "DEBIT",
      },
      conversion,
    );
    Render().viewProps.onCreateSplitSubmittingChange(true);
    Render().viewProps.onSimpleSubmittingChange(false);
    expect(Render().viewProps.isCreateSplitSubmitting).toBe(true);
  });

  it("retains closed drafts until exit and ignores an old exit after reopen", async () => {
    await Render().loadTransaction(
      "edit",
      async () => transaction("first"),
      false,
    );
    Render().viewProps.onCloseEditModal();
    const closed = Render();
    expect(closed.viewProps).toMatchObject({
      editModalOpened: false,
      editingTransactionData: { id: "first" },
    });
    await Render().loadTransaction(
      "edit",
      async () => transaction("second"),
      true,
    );
    closed.viewProps.onEditModalExitTransitionEnd();
    expect(Render().viewProps).toMatchObject({
      editModalOpened: true,
      editingTransactionData: { id: "second" },
    });
    Render().viewProps.onCloseEditModal();
    Render().viewProps.onEditModalExitTransitionEnd();
    expect(Render().flow.kind).toBe("idle");
  });

  it("accepts only the latest load across copy and edit", async () => {
    const first = deferred(),
      second = deferred();
    const a = Render().loadTransaction("edit", () => first.promise, true);
    const b = Render().loadTransaction("copy", () => second.promise, false);
    second.resolve(transaction("second"));
    await b;
    first.resolve(transaction("first"));
    await a;
    expect(Render().flow).toMatchObject({
      kind: "createSplit",
      source: "COPY",
      initialValues: { description: "second" },
    });
  });

  it("invalidates loads and callbacks after leaving and returning to an account", async () => {
    Render().openCreate(true);
    const old = Render();
    const pending = deferred();
    const loading = old.loadTransaction("edit", () => pending.promise, true);
    expect(Render("other:account").flow.kind).toBe("idle");
    expect(Render().flow.kind).toBe("idle");
    Render().openCreate(false);
    old.viewProps.onCloseSimpleModal();
    pending.resolve(transaction("stale"));
    await loading;
    expect(Render().flow).toMatchObject({
      kind: "createSplit",
      opened: true,
      source: "NEW",
    });
  });

  it("ignores superseded failures and allows retry after a current failure", async () => {
    const old = deferred();
    const pending = Render().loadTransaction("edit", () => old.promise, true);
    Render().openCreate(false);
    old.reject(new Error("stale"));
    await pending;
    expect(Render().flow.kind).toBe("createSplit");
    await expect(
      Render().loadTransaction(
        "edit",
        async () => {
          throw new Error("retry");
        },
        true,
      ),
    ).rejects.toThrow("retry");
    expect(Render().flow.kind).toBe("idle");
    await Render().loadTransaction(
      "edit",
      async () => transaction("retry"),
      true,
    );
    expect(Render().viewProps.editModalOpened).toBe(true);
  });
});
