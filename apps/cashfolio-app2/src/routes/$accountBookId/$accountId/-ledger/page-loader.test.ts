import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "@/.prisma-client/enums";
import {
  getAccountGroups,
  getAccounts,
  getExistingNodes,
  getLedgerAccountActionData,
} from "@/server/accounts";
import {
  getAccountForLedger,
  getLedgerData,
  getLedgerPeriodBounds,
} from "@/server/ledger";
import { createLedgerAccountEditModalProps } from "./account-edit-modal-props";
import {
  isLedgerPeriodFilterAvailable,
  loadLedgerPageData,
} from "./page-loader";

vi.mock("@/server/accounts", () => ({
  getAccountGroups: vi.fn(),
  getAccounts: vi.fn(),
  getExistingNodes: vi.fn(),
  getLedgerAccountActionData: vi.fn(),
}));

vi.mock("@/server/ledger", () => ({
  getAccountForLedger: vi.fn(),
  getLedgerData: vi.fn(),
  getLedgerPeriodBounds: vi.fn(),
}));

describe("loadLedgerPageData", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test.each([
    { isActive: true, accountState: "active" },
    { isActive: false, accountState: "inactive" },
  ] as const)(
    "loads $accountState editor groups and validation nodes for the ledger account",
    async ({ isActive, accountState }) => {
      const account = {
        id: "account-1",
        name: "Checking",
        isActive,
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        statementImportCsvFormat: null,
        isCashAccount: false,
        groupPathSegments: ["Bank accounts"],
      };
      const accountGroups = [
        {
          value: "group-1",
          label: "Bank accounts",
          type: AccountType.ASSET,
          equityAccountSubtype: null,
          isCashAccount: false,
          parentGroupId: null,
          treePath: [],
          treeLabel: "Bank accounts",
        },
      ];
      const existingNodes = [
        {
          id: "sibling-account",
          name: "Savings",
          nodeType: "account" as const,
          groupId: "group-1",
          type: AccountType.ASSET,
          unit: Unit.CURRENCY,
        },
      ];
      const accountTreeRow = {
        ...account,
        nodeType: "account" as const,
        groupId: "group-1",
        parentId: "group-1",
        sortOrder: null,
        balance: 0,
        balanceInReferenceCurrency: null,
        openingBalance: 0,
        deletable: true,
        deleteDisabledReason: undefined,
        archivable: isActive,
        archiveDisabledReason: undefined,
        unarchivable: !isActive,
        unarchiveDisabledReason: undefined,
      };
      vi.mocked(getAccountForLedger).mockResolvedValue(account);
      vi.mocked(getAccounts).mockResolvedValue([]);
      vi.mocked(getLedgerAccountActionData).mockResolvedValue(accountTreeRow);
      vi.mocked(getAccountGroups).mockResolvedValue(accountGroups);
      vi.mocked(getExistingNodes).mockResolvedValue(existingNodes);
      vi.mocked(getLedgerPeriodBounds).mockResolvedValue({
        minBookingDate: "2026-01-01T00:00:00.000Z",
        maxDate: "2026-10-16T00:00:00.000Z",
        currentDate: "2026-10-16T00:00:00.000Z",
        openingBalancesBookingDate: "2025-12-31T00:00:00.000Z",
      });
      vi.mocked(getLedgerData).mockResolvedValue({
        rows: [],
        referenceCurrency: null,
        firstBookingDate: null,
        balanceBeforePeriod: 0,
        hasBookingsBeforePeriod: false,
      });

      const data = await loadLedgerPageData({
        accountBookId: "book-1",
        accountId: account.id,
      });

      expect(getAccountGroups).toHaveBeenCalledExactlyOnceWith({
        data: { accountBookId: "book-1", accountState },
      });
      expect(getExistingNodes).toHaveBeenCalledExactlyOnceWith({
        data: { accountBookId: "book-1", accountState },
      });
      const props = createLedgerAccountEditModalProps({
        opened: true,
        onClose: vi.fn(),
        accountGroups: data.accountGroups,
        existingNodes: data.existingNodes,
        unitUsage: { currencies: ["CHF"], cryptocurrencies: [] },
        onSubmit: vi.fn(),
        initialValues: { ...data.accountTreeRow },
        editingId: data.account.id,
        typeDescriptor: "ASSET",
      });
      expect(props.accountGroups).toBe(accountGroups);
      expect(props.existingNodes).toBe(existingNodes);
      expect(props.initialValues?.groupId).toBe("group-1");
    },
  );
});

describe("isLedgerPeriodFilterAvailable", () => {
  test("returns true for asset and liability accounts", () => {
    expect(
      isLedgerPeriodFilterAvailable({
        type: AccountType.ASSET,
        equityAccountSubtype: null,
      }),
    ).toBe(true);
    expect(
      isLedgerPeriodFilterAvailable({
        type: AccountType.LIABILITY,
        equityAccountSubtype: null,
      }),
    ).toBe(true);
  });

  test("returns true for non-opening-balance equity accounts", () => {
    expect(
      isLedgerPeriodFilterAvailable({
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      }),
    ).toBe(true);
  });

  test("returns false for opening-balance equity accounts", () => {
    expect(
      isLedgerPeriodFilterAvailable({
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
      }),
    ).toBe(false);
  });
});
