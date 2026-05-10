import {
  PERIOD_MONTH_NAMES,
  parseExplicitMonthPeriod,
  parseExplicitYearPeriod,
} from "@/shared/period";
import {
  DEFAULT_PERIOD_VALUE,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_YTD,
} from "./-page-types";
import type { PeriodPageViewProps } from "./-page-view";

export const STORYBOOK_ACCOUNT_BOOK_ID = "storybook-book";

export function clearPeriodStorySessionStorage(accountBookId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const storageKeys = [
    `cashfolio:periodPageState:${accountBookId}`,
    `cashfolio:periodExpandedGroups:${accountBookId}:breakdown:expense`,
    `cashfolio:periodExpandedGroups:${accountBookId}:breakdown:income`,
    `cashfolio:periodExpandedGroups:${accountBookId}:allocation:asset`,
    `cashfolio:periodExpandedGroups:${accountBookId}:allocation:liability`,
    `cashfolio:periodExpandedGroups:${accountBookId}:gains-losses`,
  ];

  for (const storageKey of storageKeys) {
    window.sessionStorage.removeItem(storageKey);
  }
}

export function deriveOverviewFromSelectedPeriodValue(
  selectedPeriodValue: string,
): PeriodPageViewProps["overview"] {
  const maxDate = new Date(baseOverview.maxDate);
  const currentYear = maxDate.getUTCFullYear();
  const currentMonth = maxDate.getUTCMonth();
  const lastMonthDate = new Date(Date.UTC(currentYear, currentMonth - 1, 1));

  const explicitMonth = parseExplicitMonthPeriod(selectedPeriodValue);
  if (explicitMonth) {
    return {
      ...baseOverview,
      selectedPeriodValue: explicitMonth.value,
      selectedPeriodSpecifier: "month",
      selectedPeriodLabel: `${PERIOD_MONTH_NAMES[explicitMonth.month]} ${explicitMonth.year}`,
      selectedGranularity: "month",
      selectedYear: explicitMonth.year,
      selectedMonth: explicitMonth.month,
    };
  }

  const explicitYear = parseExplicitYearPeriod(selectedPeriodValue);
  if (explicitYear) {
    return {
      ...baseOverview,
      selectedPeriodValue: explicitYear.value,
      selectedPeriodSpecifier: "year",
      selectedPeriodLabel: explicitYear.value,
      selectedGranularity: "year",
      selectedYear: explicitYear.year,
      selectedMonth: null,
    };
  }

  if (selectedPeriodValue === PERIOD_PRESET_MTD) {
    return {
      ...baseOverview,
      selectedPeriodValue: PERIOD_PRESET_MTD,
      selectedPeriodSpecifier: "mtd",
      selectedPeriodLabel: `${PERIOD_MONTH_NAMES[currentMonth]} ${currentYear}`,
      selectedGranularity: "month",
      selectedYear: currentYear,
      selectedMonth: currentMonth,
    };
  }

  if (selectedPeriodValue === PERIOD_PRESET_YTD) {
    return {
      ...baseOverview,
      selectedPeriodValue: PERIOD_PRESET_YTD,
      selectedPeriodSpecifier: "ytd",
      selectedPeriodLabel: String(currentYear),
      selectedGranularity: "year",
      selectedYear: currentYear,
      selectedMonth: null,
    };
  }

  if (selectedPeriodValue === PERIOD_PRESET_LAST_YEAR) {
    return {
      ...baseOverview,
      selectedPeriodValue: PERIOD_PRESET_LAST_YEAR,
      selectedPeriodSpecifier: "last-year",
      selectedPeriodLabel: String(currentYear - 1),
      selectedGranularity: "year",
      selectedYear: currentYear - 1,
      selectedMonth: null,
    };
  }

  return {
    ...baseOverview,
    selectedPeriodValue: PERIOD_PRESET_LAST_MONTH,
    selectedPeriodSpecifier: "last-month",
    selectedPeriodLabel: `${PERIOD_MONTH_NAMES[lastMonthDate.getUTCMonth()]} ${lastMonthDate.getUTCFullYear()}`,
    selectedGranularity: "month",
    selectedYear: lastMonthDate.getUTCFullYear(),
    selectedMonth: lastMonthDate.getUTCMonth(),
  };
}

export const baseOverview: PeriodPageViewProps["overview"] = {
  selectedPeriodValue: DEFAULT_PERIOD_VALUE,
  selectedPeriodSpecifier: "last-month",
  selectedPeriodLabel: "February 2026",
  selectedGranularity: "month",
  selectedYear: 2026,
  selectedMonth: 1,
  periodDateRange: {
    from: "2026-02-01T00:00:00.000Z",
    to: "2026-02-28T00:00:00.000Z",
  },
  minBookingDate: "2021-03-01T00:00:00.000Z",
  maxDate: "2026-03-28T00:00:00.000Z",
  availableYears: [2026, 2025, 2024, 2023, 2022, 2021],
  currentMonthValue: "2026-03",
  currentYearValue: "2026",
  referenceCurrency: "CHF",
  bookingsCount: 92,
  convertedBookingsCount: 90,
  skippedBookingsCount: 2,
  stats: {
    totalReturn: 4200,
    savings: 2500,
    income: 8000,
    expenses: 5500,
    gainsLosses: 1700,
    endOfPeriodNetWorth: 245_000,
    endOfPeriodAssets: 310_000,
    endOfPeriodLiabilities: 65_000,
    explicitGainLoss: 1200,
    realizedGainLoss: 1500,
    unrealizedGainLoss: 200,
  },
  expenseBreakdown: {
    totalAmount: 5500,
    hasHiddenAmountDiscrepancy: false,
    hiddenAmountDiscrepancyNodeIds: [],
    items: [
      {
        id: "group:housing",
        label: "Housing",
        kind: "group",
        amount: 1900,
        percentage: 34.5,
      },
      {
        id: "group:food",
        label: "Food",
        kind: "group",
        amount: 1400,
        percentage: 25.5,
      },
      {
        id: "group:transport",
        label: "Transportation",
        kind: "group",
        amount: 950,
        percentage: 17.3,
      },
      {
        id: "account:account-subscriptions",
        label: "Subscriptions",
        kind: "account",
        amount: 700,
        percentage: 12.7,
      },
      {
        id: "group:other",
        label: "Other",
        kind: "group",
        amount: 550,
        percentage: 10,
      },
    ],
    hierarchy: [
      {
        id: "group:housing",
        label: "Housing",
        kind: "group",
        amount: 1900,
        children: [
          {
            id: "account:account-rent",
            label: "Rent",
            kind: "account",
            amount: 1600,
            children: [],
          },
          {
            id: "account:account-utilities",
            label: "Utilities",
            kind: "account",
            amount: 300,
            children: [],
          },
        ],
      },
      {
        id: "group:food",
        label: "Food",
        kind: "group",
        amount: 1400,
        children: [
          {
            id: "account:account-groceries",
            label: "Groceries",
            kind: "account",
            amount: 900,
            children: [],
          },
          {
            id: "account:account-dining",
            label: "Dining",
            kind: "account",
            amount: 500,
            children: [],
          },
        ],
      },
      {
        id: "group:transport",
        label: "Transportation",
        kind: "group",
        amount: 950,
        children: [
          {
            id: "account:account-transit",
            label: "Transit",
            kind: "account",
            amount: 550,
            children: [],
          },
          {
            id: "account:account-fuel",
            label: "Fuel",
            kind: "account",
            amount: 400,
            children: [],
          },
        ],
      },
      {
        id: "account:account-subscriptions",
        label: "Subscriptions",
        kind: "account",
        amount: 700,
        children: [],
      },
      {
        id: "group:other",
        label: "Other",
        kind: "group",
        amount: 550,
        children: [
          {
            id: "account:account-other-expense",
            label: "Other Expense",
            kind: "account",
            amount: 550,
            children: [],
          },
        ],
      },
    ],
  },
  incomeBreakdown: {
    totalAmount: 8000,
    hasHiddenAmountDiscrepancy: false,
    hiddenAmountDiscrepancyNodeIds: [],
    items: [
      {
        id: "group:salary",
        label: "Salary",
        kind: "group",
        amount: 6200,
        percentage: 77.5,
      },
      {
        id: "group:investments",
        label: "Investments",
        kind: "group",
        amount: 1300,
        percentage: 16.3,
      },
      {
        id: "account:account-other-income",
        label: "Other Income",
        kind: "account",
        amount: 500,
        percentage: 6.3,
      },
    ],
    hierarchy: [
      {
        id: "group:salary",
        label: "Salary",
        kind: "group",
        amount: 6200,
        children: [
          {
            id: "account:account-main-salary",
            label: "Main Salary",
            kind: "account",
            amount: 6200,
            children: [],
          },
        ],
      },
      {
        id: "group:investments",
        label: "Investments",
        kind: "group",
        amount: 1300,
        children: [
          {
            id: "account:account-dividends",
            label: "Dividends",
            kind: "account",
            amount: 900,
            children: [],
          },
          {
            id: "account:account-interest",
            label: "Interest",
            kind: "account",
            amount: 400,
            children: [],
          },
        ],
      },
      {
        id: "account:account-other-income",
        label: "Other Income",
        kind: "account",
        amount: 500,
        children: [],
      },
    ],
  },
  assetBreakdown: {
    totalAmount: 25000,
    hasHiddenAmountDiscrepancy: false,
    hiddenAmountDiscrepancyNodeIds: [],
    skippedMissingReferenceBalanceCount: 1,
    skippedNegativeCount: 1,
    items: [
      {
        id: "group:investments",
        label: "Investments",
        kind: "group",
        amount: 15000,
        percentage: 60,
      },
      {
        id: "group:cash",
        label: "Cash",
        kind: "group",
        amount: 10000,
        percentage: 40,
      },
    ],
    hierarchy: [
      {
        id: "group:investments",
        label: "Investments",
        kind: "group",
        amount: 15000,
        children: [
          {
            id: "account:account-etf",
            label: "ETF Portfolio",
            kind: "account",
            amount: 12000,
            children: [],
          },
          {
            id: "account:account-stocks",
            label: "Stocks",
            kind: "account",
            amount: 3000,
            children: [],
          },
        ],
      },
      {
        id: "group:cash",
        label: "Cash",
        kind: "group",
        amount: 10000,
        children: [
          {
            id: "account:account-checking",
            label: "Checking",
            kind: "account",
            amount: 10000,
            children: [],
          },
        ],
      },
    ],
  },
  liabilityBreakdown: {
    totalAmount: 5400,
    hasHiddenAmountDiscrepancy: false,
    hiddenAmountDiscrepancyNodeIds: [],
    skippedMissingReferenceBalanceCount: 0,
    skippedNegativeCount: 1,
    items: [
      {
        id: "group:debt",
        label: "Debt",
        kind: "group",
        amount: 5400,
        percentage: 100,
      },
    ],
    hierarchy: [
      {
        id: "group:debt",
        label: "Debt",
        kind: "group",
        amount: 5400,
        children: [
          {
            id: "account:account-credit-card",
            label: "Credit Card",
            kind: "account",
            amount: 1400,
            children: [],
          },
          {
            id: "account:account-personal-loan",
            label: "Personal Loan",
            kind: "account",
            amount: 4000,
            children: [],
          },
        ],
      },
    ],
  },
  gainsLossesBreakdown: {
    hierarchy: [
      {
        id: "unit-type:fx",
        label: "FX",
        realizedGainLoss: 200,
        unrealizedGainLoss: 80,
        totalGainLoss: 280,
        children: [
          {
            id: "unit:fx:USD",
            label: "USD",
            realizedGainLoss: 200,
            unrealizedGainLoss: 80,
            totalGainLoss: 280,
            children: [
              {
                id: "unit-account:fx:USD:account-cash-usd-1",
                label: "Cash Account USD 1",
                realizedGainLoss: 120,
                unrealizedGainLoss: 40,
                totalGainLoss: 160,
                children: [],
              },
              {
                id: "unit-account:fx:USD:account-cash-usd-2",
                label: "Cash Account USD 2",
                realizedGainLoss: 80,
                unrealizedGainLoss: 40,
                totalGainLoss: 120,
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: "unit-type:security",
        label: "Security",
        realizedGainLoss: 1000,
        unrealizedGainLoss: 100,
        totalGainLoss: 1100,
        children: [
          {
            id: "unit:security:AAPL:USD",
            label: "AAPL (USD)",
            realizedGainLoss: 1000,
            unrealizedGainLoss: 100,
            totalGainLoss: 1100,
            children: [
              {
                id: "unit-account:security:AAPL:USD:account-aapl-trading",
                label: "AAPL Trading Account",
                realizedGainLoss: 1000,
                unrealizedGainLoss: 100,
                totalGainLoss: 1100,
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: "unit-type:cryptocurrency",
        label: "Cryptocurrency",
        realizedGainLoss: 300,
        unrealizedGainLoss: 20,
        totalGainLoss: 320,
        children: [
          {
            id: "unit:crypto:BTC",
            label: "BTC",
            realizedGainLoss: 300,
            unrealizedGainLoss: 20,
            totalGainLoss: 320,
            children: [
              {
                id: "unit-account:crypto:BTC:account-btc-wallet",
                label: "BTC Wallet",
                realizedGainLoss: 300,
                unrealizedGainLoss: 20,
                totalGainLoss: 320,
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: "unit-type:explicit",
        label: "Explicit G/L",
        realizedGainLoss: 60,
        unrealizedGainLoss: 0,
        totalGainLoss: 60,
        children: [
          {
            id: "explicit-account:account-fees",
            label: "Fees Adjustment Account",
            realizedGainLoss: 60,
            unrealizedGainLoss: 0,
            totalGainLoss: 60,
            children: [],
          },
        ],
      },
    ],
  },
};
