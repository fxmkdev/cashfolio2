import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";

const getAccountsPageData = vi.hoisted(() => vi.fn());

vi.mock("@/server/accounts", () => ({
  getAccountsPageData,
}));

import { loadAccountsPageData } from "./-page-loader";

describe("loadAccountsPageData", () => {
  const mockResult = {
    accountGroups: [],
    existingNodes: [],
    referenceCurrency: "CHF",
    unitUsage: { currencies: ["CHF"], cryptocurrencies: [] },
    rows: [],
  };

  beforeEach(() => {
    getAccountsPageData.mockReset();
    getAccountsPageData.mockResolvedValue(mockResult);
  });

  it("loads active and archived accounts for the unified balance scope", async () => {
    const result = await loadAccountsPageData({
      accountBookId: "book-1",
      mode: "active",
      tab: "BALANCE",
    });

    expect(getAccountsPageData).toHaveBeenCalledTimes(1);
    expect(getAccountsPageData).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        accountState: "all",
        type: "BALANCE",
      },
    });
    expect(result).toBe(mockResult);
  });

  it.each([
    [false, "active"],
    [true, "all"],
  ] as const)(
    "loads category states for archived visibility %s",
    async (showArchived, accountState) => {
      await loadAccountsPageData({
        accountBookId: "book-2",
        showArchived,
        tab: `EQUITY-${EquityAccountSubtype.EXPENSE}`,
      });

      expect(getAccountsPageData).toHaveBeenCalledTimes(1);
      expect(getAccountsPageData).toHaveBeenCalledWith({
        data: {
          accountBookId: "book-2",
          accountState,
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        },
      });
    },
  );
});
