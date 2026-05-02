import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";

const getAccountsPageData = vi.hoisted(() => vi.fn());
const getUserAccountBooks = vi.hoisted(() => vi.fn());

vi.mock("@/server/accounts", () => ({
  getAccountsPageData,
}));
vi.mock("@/server/home", () => ({
  getUserAccountBooks,
}));

import { loadAccountsPageData } from "./-page-loader";

describe("loadAccountsPageData", () => {
  const mockResult = {
    accountGroups: [],
    existingNodes: [],
    referenceCurrency: "CHF",
    rows: [],
  };
  const mockAccountBooks = [
    { id: "book-1", name: "Alpha Book" },
    { id: "book-2", name: "Beta Book" },
  ];

  beforeEach(() => {
    getAccountsPageData.mockReset();
    getUserAccountBooks.mockReset();
    getAccountsPageData.mockResolvedValue(mockResult);
    getUserAccountBooks.mockResolvedValue(mockAccountBooks);
  });

  it("loads only the selected asset tab in active mode", async () => {
    const result = await loadAccountsPageData({
      accountBookId: "book-1",
      mode: "active",
      tab: "ASSET",
    });

    expect(getAccountsPageData).toHaveBeenCalledTimes(1);
    expect(getUserAccountBooks).toHaveBeenCalledTimes(1);
    expect(getAccountsPageData).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        accountState: "active",
        type: AccountType.ASSET,
      },
    });
    expect(result).toEqual({
      ...mockResult,
      accountBooks: mockAccountBooks,
    });
  });

  it("loads the selected equity subtype in archived mode", async () => {
    await loadAccountsPageData({
      accountBookId: "book-2",
      mode: "archived",
      tab: `EQUITY-${EquityAccountSubtype.EXPENSE}`,
    });

    expect(getAccountsPageData).toHaveBeenCalledTimes(1);
    expect(getAccountsPageData).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-2",
        accountState: "inactive",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      },
    });
    expect(getUserAccountBooks).toHaveBeenCalledTimes(1);
  });
});
