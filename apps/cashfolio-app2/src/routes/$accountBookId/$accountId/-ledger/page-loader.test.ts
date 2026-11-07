import { beforeEach, describe, expect, test, vi } from "vitest";
import { notFound, rootRouteId } from "@tanstack/react-router";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "@/.prisma-client/enums";
import {
  getAccountGroups,
  getAccountNavigationGroups,
  getAccounts,
  getExistingNodes,
  getLedgerAccountActionData,
} from "@/server/accounts";
import {
  getAccountForLedger,
  getLedgerData,
  getLedgerPeriodBounds,
} from "@/server/ledger";
import { getAccountRecordedGainLossEligibility } from "@/server/account-gain-loss";
import { createLedgerAccountEditModalProps } from "./account-edit-modal-props";
import {
  isLedgerPeriodFilterAvailable,
  loadLedgerPageData,
} from "./page-loader";

vi.mock("@/server/accounts", () => ({
  getAccountGroups: vi.fn(),
  getAccountNavigationGroups: vi.fn().mockResolvedValue([]),
  getAccounts: vi.fn(),
  getExistingNodes: vi.fn(),
  getLedgerAccountActionData: vi.fn(),
}));

vi.mock("@/server/account-gain-loss", () => ({
  getAccountRecordedGainLossEligibility: vi.fn(),
}));

vi.mock("@/server/ledger", () => ({
  getAccountForLedger: vi.fn(),
  getLedgerData: vi.fn(),
  getLedgerPeriodBounds: vi.fn(),
}));

const ledgerAccount: Awaited<ReturnType<typeof getAccountForLedger>> = {
  assetClassId: null,
  trackingMethod: "INDIVIDUAL_UNITS",

  id: "account-1",
  name: "Checking",
  isActive: true,
  type: AccountType.BALANCE,
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

describe("loadLedgerPageData", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAccountRecordedGainLossEligibility).mockResolvedValue(false);
    vi.mocked(getAccountNavigationGroups).mockResolvedValue([]);
  });

  test.each(["account", "account list"])(
    "handles both missing-book rejections when the %s lookup fails first",
    async (firstLookup) => {
      const firstError = notFound({ routeId: rootRouteId });
      const laterError = notFound({ routeId: rootRouteId });
      let rejectLater!: (reason: unknown) => void;
      const later = new Promise<never>((_resolve, reject) => {
        rejectLater = reject;
      });
      if (firstLookup === "account") {
        vi.mocked(getAccountForLedger).mockRejectedValue(firstError);
        vi.mocked(getAccounts).mockReturnValue(later);
      } else {
        vi.mocked(getAccountForLedger).mockReturnValue(later);
        vi.mocked(getAccounts).mockRejectedValue(firstError);
      }

      const result = loadLedgerPageData({
        accountBookId: "missing-book",
        accountId: "missing-account",
      });
      const rejected = expect(result).rejects.toBe(firstError);
      rejectLater(laterError);
      await rejected;
      // Allow orphaned rejections to surface, as they do in the SSR process.
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(getLedgerData).not.toHaveBeenCalled();
    },
  );

  test.each([
    { isActive: true, accountState: "active" },
    { isActive: false, accountState: "inactive" },
  ] as const)(
    "loads $accountState editor groups and validation nodes for the ledger account",
    async ({ isActive, accountState }) => {
      const account = {
        ...ledgerAccount,
        isActive,
      };
      const accountGroups = [
        {
          value: "group-1",
          label: "Bank accounts",
          type: AccountType.BALANCE,
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
          type: AccountType.BALANCE,
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
        referenceCurrency: "CHF",
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
      expect(getAccountNavigationGroups).toHaveBeenCalledExactlyOnceWith({
        data: { accountBookId: "book-1" },
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
        typeDescriptor: "BALANCE",
      });
      expect(props.accountGroups).toBe(accountGroups);
      expect(props.existingNodes).toBe(existingNodes);
      expect(props.initialValues?.groupId).toBe("group-1");
    },
  );

  test.each([
    { name: "reference-currency asset", account: {}, showGainLoss: false },
    {
      name: "reference-currency liability",
      account: { type: AccountType.BALANCE },
      showGainLoss: false,
    },
    {
      name: "case-insensitive reference-currency match",
      account: { currency: "chf" },
      showGainLoss: false,
    },
    {
      name: "foreign-currency asset",
      account: { currency: "USD" },
      showGainLoss: true,
    },
    {
      name: "foreign-currency liability",
      account: { type: AccountType.BALANCE, currency: "EUR" },
      showGainLoss: true,
    },
    {
      name: "cryptocurrency",
      account: {
        unit: Unit.CRYPTOCURRENCY,
        currency: null,
        cryptocurrency: "BTC",
      },
      showGainLoss: true,
    },
    {
      name: "security traded in reference currency",
      account: {
        unit: Unit.SECURITY,
        currency: null,
        symbol: "AAPL",
        tradeCurrency: "CHF",
      },
      showGainLoss: true,
    },
    {
      name: "equity income",
      account: {
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.INCOME,
        currency: null,
        unit: null,
      },
      showGainLoss: false,
    },
    {
      name: "equity expenses",
      account: {
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        currency: null,
        unit: null,
      },
      showGainLoss: false,
    },
    {
      name: "opening balances",
      account: {
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
        currency: null,
        unit: null,
      },
      showGainLoss: false,
    },
    {
      name: "archived foreign-currency account",
      account: { isActive: false, currency: "USD" },
      showGainLoss: true,
    },
    {
      name: "archived reference-currency account",
      account: { isActive: false },
      showGainLoss: false,
    },
    {
      name: "incomplete holding metadata",
      account: { currency: null, unit: null },
      showGainLoss: true,
    },
  ])(
    "decides G/L visibility before rendering for $name",
    async ({ account, showGainLoss }) => {
      vi.mocked(getAccountForLedger).mockResolvedValue({
        ...ledgerAccount,
        ...account,
      });
      vi.mocked(getLedgerData).mockResolvedValue({
        rows: [],
        referenceCurrency: "CHF",
        firstBookingDate: null,
        balanceBeforePeriod: 0,
        hasBookingsBeforePeriod: false,
      });

      const data = await loadLedgerPageData({
        accountBookId: "book-1",
        accountId: ledgerAccount.id,
      });

      expect(data.showGainLoss).toBe(showGainLoss);
      expect(data.referenceCurrency).toBe("CHF");
      if (data.account.type === AccountType.BALANCE) {
        expect(getAccountNavigationGroups).toHaveBeenCalledExactlyOnceWith({
          data: { accountBookId: "book-1" },
        });
      } else {
        expect(getAccountNavigationGroups).not.toHaveBeenCalled();
        expect(data.navigationGroups).toEqual([]);
      }
      if (data.account.type !== AccountType.EQUITY) {
        expect(getLedgerData).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ includeReferenceValues: false }),
          }),
        );
      }
    },
  );
});

test("shows recorded reference-currency G/L and forwards the historical cutoff", async () => {
  vi.mocked(getAccountForLedger).mockResolvedValue(ledgerAccount);
  vi.mocked(getLedgerData).mockResolvedValue({
    rows: [],
    referenceCurrency: "CHF",
    firstBookingDate: null,
    balanceBeforePeriod: 0,
    hasBookingsBeforePeriod: false,
  });
  vi.mocked(getAccountRecordedGainLossEligibility).mockResolvedValue(true);
  const result = await loadLedgerPageData({
    accountBookId: "book-1",
    accountId: "account-1",
    period: "2026-02",
  });
  expect(result.showGainLoss).toBe(true);
  expect(getAccountRecordedGainLossEligibility).toHaveBeenCalledWith({
    data: {
      accountBookId: "book-1",
      accountId: "account-1",
      period: "2026-02",
    },
  });
});

describe("isLedgerPeriodFilterAvailable", () => {
  test("returns true for asset and liability accounts", () => {
    expect(
      isLedgerPeriodFilterAvailable({
        type: AccountType.BALANCE,
        equityAccountSubtype: null,
      }),
    ).toBe(true);
    expect(
      isLedgerPeriodFilterAvailable({
        type: AccountType.BALANCE,
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
