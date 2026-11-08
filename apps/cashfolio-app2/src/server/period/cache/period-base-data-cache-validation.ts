import {
  AccountTrackingMethod,
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../../.prisma-client/enums";
import { PERIOD_PRESET_VALUES } from "../../../shared/reporting/period";
import type { ClassificationNode } from "../../../shared/classification/asset-class";
import {
  cacheArray,
  cacheBoolean,
  cacheDate,
  cacheEnum,
  cacheInteger,
  cacheMoney,
  cacheNullable,
  cacheObject,
  cacheOptional,
  cacheString,
} from "../../cache-validation";
import type {
  PeriodBaseData,
  PeriodBaseHoldingTransaction,
  PeriodBaseCashFlowTransaction,
  PeriodBaseExecutionResidualTransaction,
} from "../base-data/period-base-data-types";
import type {
  TransferClearingUnitBucket,
  TransferClearingBooking,
} from "../transfer-clearing/period-transfer-clearing-types";

const nullableString = cacheNullable(cacheString);
const unit = cacheEnum(Object.values(Unit));
const accountType = cacheEnum(Object.values(AccountType));
const equitySubtype = cacheEnum(Object.values(EquityAccountSubtype));
const instrument = {
  unit,
  currency: nullableString,
  cryptocurrency: nullableString,
  symbol: nullableString,
  tradeCurrency: nullableString,
};
const booking = {
  ...instrument,
  id: cacheString,
  date: cacheDate,
  value: cacheMoney,
};
const descriptions = {
  description: cacheOptional(nullableString),
  transactionDescription: cacheOptional(nullableString),
};

const selection = cacheObject<PeriodBaseData["selection"]>({
  periodValue: cacheString,
  label: cacheString,
  periodSpecifier: cacheEnum([...PERIOD_PRESET_VALUES, "month", "year"]),
  granularity: cacheEnum(["month", "year"]),
  year: cacheInteger,
  month: cacheNullable(cacheInteger),
  from: cacheDate,
  to: cacheDate,
  queryEndExclusive: cacheDate,
  initialHoldingDate: cacheDate,
  isBeforeAccountBookStart: cacheBoolean,
  minPeriodDate: cacheDate,
});
const group = cacheObject<PeriodBaseData["allAccountGroups"][number]>({
  id: cacheString,
  name: cacheString,
  parentGroupId: nullableString,
});
const account = cacheObject<
  PeriodBaseData["baseAssetLiabilityAccounts"][number]
>({
  ...instrument,
  unit: cacheNullable(unit),
  id: cacheString,
  name: cacheString,
  groupId: nullableString,
  type: accountType,
  assetClassId: nullableString,
  trackingMethod: cacheOptional(
    cacheEnum(Object.values(AccountTrackingMethod)),
  ),
  isCashAccount: cacheBoolean,
});
const holdingAccount = cacheObject<
  PeriodBaseData["holdingAccountsResolved"][number]
>({ ...instrument, id: cacheString });
const balance = cacheObject<PeriodBaseData["endOfPeriodRawBalances"][number]>({
  accountId: cacheString,
  rawBalance: cacheMoney,
});
const equityBooking = cacheObject<PeriodBaseData["equityBookings"][number]>({
  ...booking,
  ...descriptions,
  accountId: cacheString,
  accountName: cacheString,
  accountGroupId: nullableString,
  equityAccountSubtype: equitySubtype,
  transactionId: cacheString,
});
const holdingBooking = cacheObject<
  PeriodBaseHoldingTransaction["bookings"][number]
>({
  ...booking,
  ...descriptions,
  transactionId: cacheOptional(nullableString),
  accountId: cacheString,
  accountType,
  equityAccountSubtype: cacheNullable(equitySubtype),
});
const cashFlowBooking = cacheObject<
  PeriodBaseCashFlowTransaction["bookings"][number]
>({
  ...booking,
  account: cacheObject<
    PeriodBaseCashFlowTransaction["bookings"][number]["account"]
  >({
    id: cacheString,
    name: cacheString,
    groupId: nullableString,
    type: accountType,
    isCashAccount: cacheBoolean,
  }),
});
const residualBooking = cacheObject<
  PeriodBaseExecutionResidualTransaction["bookings"][number]
>({
  ...booking,
  accountId: cacheString,
  account: cacheObject<
    PeriodBaseExecutionResidualTransaction["bookings"][number]["account"]
  >({ name: cacheString }),
});
const clearingBooking = cacheObject<TransferClearingBooking>({
  ...booking,
  ...descriptions,
  transactionId: cacheOptional(nullableString),
  originatingAccountIds: cacheOptional(cacheArray(cacheString)),
});
const clearingBucket = cacheObject<TransferClearingUnitBucket>({
  ...instrument,
  unitKey: cacheString,
  unitLabel: cacheString,
  unitType: cacheEnum(["currency", "security", "cryptocurrency"]),
  isNonReferenceUnit: cacheBoolean,
  rawBalance: cacheMoney,
  bookings: cacheArray(clearingBooking),
});

export const isPeriodBaseDataCacheEntry = cacheObject<PeriodBaseData>({
  accountBookId: cacheString,
  periodValue: cacheString,
  referenceCurrency: cacheString,
  selection,
  assetClasses: cacheOptional(
    cacheArray(
      cacheObject<ClassificationNode>({
        id: cacheString,
        name: cacheString,
        parentId: nullableString,
        sortOrder: cacheInteger,
      }),
    ),
  ),
  allAccountGroups: cacheArray(group),
  baseAssetLiabilityAccounts: cacheArray(account),
  holdingAccountsResolved: cacheArray(holdingAccount),
  endOfPeriodRawBalances: cacheArray(balance),
  transferClearingUnitBuckets: cacheArray(clearingBucket),
  equityBookings: cacheArray(equityBooking),
  explicitCounterparts: cacheArray(
    cacheObject<PeriodBaseData["explicitCounterparts"][number]>({
      transactionId: cacheString,
      accountId: cacheString,
      accountName: cacheString,
    }),
  ),
  initialHoldingBalances: cacheArray(balance),
  holdingTransactions: cacheArray(
    cacheObject<PeriodBaseHoldingTransaction>({
      id: cacheString,
      bookings: cacheArray(holdingBooking),
    }),
  ),
  executionResidualTransactions: cacheArray(
    cacheObject<PeriodBaseExecutionResidualTransaction>({
      id: cacheString,
      bookings: cacheArray(residualBooking),
    }),
  ),
  cashFlowTransactions: cacheArray(
    cacheObject<PeriodBaseCashFlowTransaction>({
      id: cacheString,
      bookings: cacheArray(cashFlowBooking),
    }),
  ),
  hasCashAccounts: cacheBoolean,
});
