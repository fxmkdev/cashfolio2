import { beforeEach, describe, expect, it, vi } from "vitest";
import { toMoney } from "../../../shared/money";
import { account, cash } from "./return-test-support";

const mocks = vi.hoisted(() => ({
  inputs: vi.fn(),
  rate: vi.fn(),
  conversion: vi.fn(),
  cache: vi.fn(),
}));
vi.mock("./return-inputs.server", () => ({
  loadAccountReturnInputs: mocks.inputs,
}));
vi.mock("../../period/period-conversion", () => ({
  getUnitToReferenceExchangeRateDetails: mocks.rate,
  convertBookingValueToReferenceDetails: mocks.conversion,
}));
vi.mock("./return-cache.server", () => ({
  getOrLoadAccountReturnSummaries: mocks.cache,
}));
import {
  loadAccountReturnSummaries,
  queryAccountReturnDetails,
} from "./account-returns.server";

function inputs() {
  return {
    accounts: [
      account(),
      account("cash", { currency: "CHF" }),
      account("archived", {
        currency: "CHF",
        isActive: false,
        trackingMethod: "TOTAL_PORTFOLIO_VALUE",
      }),
    ],
    groups: [
      { id: "group", name: "Group", parentGroupId: null, isActive: true },
    ],
    classes: [
      { id: "equities", name: "Equities", parentId: null, sortOrder: 0 },
    ],
    transactions: [
      {
        bookings: [
          cash("adjusted", "2026-03-01", "10", { accountId: "archived" }),
          cash("gain", "2026-03-01", "-10", {
            accountType: "EQUITY",
            accountId: "equity",
            equityAccountSubtype: "GAIN_LOSS",
          }),
        ],
      },
    ],
    initialBalances: new Map([
      ["a", toMoney(100)],
      ["cash", toMoney(100)],
      ["archived", toMoney(100)],
    ]),
    revision: "revision",
    startDate: "2026-01-01",
    asOfDate: "2026-12-31",
    referenceCurrency: "CHF",
  };
}
const scope = {
  accountBookId: "book",
  grouping: "accountStructure" as const,
  accountState: "all" as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.inputs.mockResolvedValue(inputs());
  mocks.rate.mockImplementation(async ({ currency, date }) => ({
    rate: toMoney(
      currency === "CHF" || date.toISOString().startsWith("2025") ? 1 : 1.2,
    ),
    source: "timeSeries",
  }));
  mocks.conversion.mockImplementation(async ({ value }) => ({
    value,
    source: "identity",
  }));
});
describe("account return query scopes", () => {
  it("matches G/L leaf eligibility while including cash and archived accounts in group capital", async () => {
    const { data } = await loadAccountReturnSummaries(scope);
    expect(data.rows.find((row) => row.id === "cash")?.applicable).toBe(false);
    expect(data.rows.find((row) => row.id === "archived")?.applicable).toBe(
      true,
    );
    expect(data.rows.find((row) => row.id === "a")?.twr).toBeCloseTo(0.2, 12);
    expect(data.total.twr).toBeCloseTo(0.1, 12);
    expect(data.rows.find((row) => row.id === "group")?.twr).toBeCloseTo(
      data.total.twr!,
      12,
    );
    expect(
      data.rows.find((row) => row.id === "__archived__:group:group")?.twr,
    ).toBeCloseTo(0.1, 12);
  });
  it("retains the same footer when switching to Asset Class and calculates unit headings", async () => {
    const structure = await loadAccountReturnSummaries(scope);
    const classified = await loadAccountReturnSummaries({
      ...scope,
      grouping: "assetClass",
    });
    expect(classified.data.total).toEqual(structure.data.total);
    expect(
      classified.data.rows.find((row) => row.id === "__asset_class__:equities")
        ?.twr,
    ).toBeCloseTo(0.1, 12);
    expect(
      classified.data.rows.some((row) =>
        row.id.startsWith("__asset_class_unit__:"),
      ),
    ).toBe(true);
  });
  it("uses account state for group membership and ledger period end for detail reads", async () => {
    const active = await loadAccountReturnSummaries({
      ...scope,
      accountState: "active",
    });
    expect(active.data.total.twr).toBeCloseTo(0.1, 12);
    expect(active.data.rows.some((row) => row.id === "archived")).toBe(false);
    const result = await queryAccountReturnDetails({
      ...scope,
      target: { kind: "account", id: "a" },
      period: "2026-02",
    });
    expect(result.name).toBe("a");
    expect(mocks.inputs).toHaveBeenLastCalledWith(
      "book",
      new Date("2026-02-28T00:00:00Z"),
    );
    await expect(
      queryAccountReturnDetails({
        ...scope,
        target: { kind: "account", id: "missing" },
      }),
    ).rejects.toThrow("not found");
    await expect(
      queryAccountReturnDetails({
        ...scope,
        target: { kind: "group", id: "missing" },
      }),
    ).rejects.toThrow("not found");
  });
  it("marks provider, fallback, and missing dependencies as ineligible for persistence", async () => {
    for (const source of ["provider", "fallback", "missing"]) {
      mocks.rate.mockResolvedValue({
        rate: source === "missing" ? null : toMoney(1.2),
        source,
      });
      expect((await loadAccountReturnSummaries(scope)).cacheable).toBe(false);
    }
  });
});
