import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
} from "../../../.prisma-client/enums";

const getAccountsPageData = vi.hoisted(() => vi.fn());

vi.mock("../../server/accounts", () => ({
  getAccountsPageData,
}));

import { loadAccountsPageData } from "./-page-loader";

describe("loadAccountsPageData", () => {
  const mockResult = {
    accountGroups: [],
    existingNodes: [],
    referenceCurrency: "CHF",
    rows: [],
  };

  beforeEach(() => {
    getAccountsPageData.mockReset();
    getAccountsPageData.mockResolvedValue(mockResult);
  });

  it("loads only the selected asset tab in active mode", async () => {
    const result = await loadAccountsPageData({
      accountBookId: "book-1",
      mode: "active",
      tab: "ASSET",
    });

    expect(getAccountsPageData).toHaveBeenCalledTimes(1);
    expect(getAccountsPageData).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        accountState: "active",
        type: AccountType.ASSET,
      },
    });
    expect(result).toBe(mockResult);
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
  });
});
