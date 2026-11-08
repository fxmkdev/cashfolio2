import { vi } from "vitest";

vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId: vi.fn(),
}));

vi.mock("../prisma.server", () => ({
  prisma: {},
}));

vi.mock("./valuation.server", () => ({
  getCurrencyExchangeRate: vi.fn(),
  getCryptocurrencyToCurrencyExchangeRate: vi.fn(),
  getSecurityToCurrencyExchangeRate: vi.fn(),
}));
export {
  AccountType,
  buildBreakdownHierarchy,
  buildBreakdownHierarchyWithMeta,
  buildBreakdownItems,
  buildPeriodEndAllocationBreakdown,
  computeEndOfPeriodBalanceStats,
  computeHoldingGainLossForEventSeries,
  createBreakdownBucket,
  DEFAULT_PERIOD_VALUE,
  getPeriodEndExclusive,
  isMultiUnitTransaction,
  normalizePeriodValue,
  resolvePeriodSelection,
  shouldIncludeTransactionForPeriod,
  Unit,
};

// Register mocks before importing the tested modules and their dependencies.
const { AccountType, Unit } = await import("../.prisma-client/enums");
const {
  computeEndOfPeriodBalanceStats,
  DEFAULT_PERIOD_VALUE,
  buildBreakdownHierarchy,
  buildBreakdownItems,
  computeHoldingGainLossForEventSeries,
  createBreakdownBucket,
  getPeriodEndExclusive,
  isMultiUnitTransaction,
  normalizePeriodValue,
  resolvePeriodSelection,
  shouldIncludeTransactionForPeriod,
} = await import("./period");
const { buildBreakdownHierarchyWithMeta, buildPeriodEndAllocationBreakdown } =
  await import("./period/period-helpers");
