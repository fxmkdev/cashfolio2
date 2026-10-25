import type { AccountOption } from "@/shared/account-options";
import type { SimpleTransactionDraftValues } from "@/components/transactions/simple-transaction-modal";
import { getBookingUnitFields } from "@/shared/booking-unit-fields";
import {
  buildSimpleTransactionValues,
  normalizeSimpleDraft,
  toCreateSplitInitialValues,
  toEditTransactionData,
  type SimpleTransactionEditInitialValues,
} from "./page-transaction-utils";
import type {
  SimpleTransactionValues,
  SplitModalInitialValues,
} from "./page-view";

type CurrentAccountForSimpleTransaction = {
  id: string;
  unit: AccountOption["unit"];
  currency: AccountOption["currency"];
  cryptocurrency: AccountOption["cryptocurrency"];
  symbol: AccountOption["symbol"];
  tradeCurrency: AccountOption["tradeCurrency"];
};

function resolveCounterAccount(
  allAccountOptions: AccountOption[],
  counterAccountId: string,
): AccountOption {
  const counterAccount = allAccountOptions.find(
    (option) => option.value === counterAccountId,
  );
  if (!counterAccount) {
    throw new Error("Counter account was not found.");
  }
  return counterAccount;
}

function buildPayloadFromSimpleDraft(args: {
  draft: SimpleTransactionDraftValues;
  fallback: SimpleTransactionEditInitialValues;
  allAccountOptions: AccountOption[];
  currentAccount: CurrentAccountForSimpleTransaction;
}) {
  const normalized = normalizeSimpleDraft({
    draft: args.draft,
    fallback: args.fallback,
  });
  const counterAccount = resolveCounterAccount(
    args.allAccountOptions,
    normalized.counterAccountId,
  );

  return buildSimpleTransactionValues({
    values: normalized,
    currentAccount: args.currentAccount,
    counterAccount,
  });
}

export function createSplitInitialValuesFromSimpleDraft(args: {
  draft: SimpleTransactionDraftValues;
  fallback: SimpleTransactionEditInitialValues;
  allAccountOptions: AccountOption[];
  currentAccount: CurrentAccountForSimpleTransaction;
}): SplitModalInitialValues {
  if (!args.draft.counterAccountId) {
    const values = normalizeSimpleDraft(args);
    const debit = values.direction === "DEBIT";
    const amount = values.amount > 0 ? values.amount : undefined;

    return {
      description: values.description,
      bookings: [
        {
          date: values.date,
          account: args.currentAccount.id,
          description: "",
          ...getBookingUnitFields(args.currentAccount, "current account"),
          debit: debit ? amount : undefined,
          credit: debit ? undefined : amount,
        },
        {
          date: values.date,
          account: "",
          description: "",
          debit: debit ? undefined : amount,
          credit: debit ? amount : undefined,
        },
      ],
    };
  }

  const payload = buildPayloadFromSimpleDraft(args);
  return toCreateSplitInitialValues(payload.description, payload.bookings);
}

export function createEditTransactionPatchFromSimpleDraft(args: {
  draft: SimpleTransactionDraftValues;
  fallback: SimpleTransactionEditInitialValues;
  allAccountOptions: AccountOption[];
  currentAccount: CurrentAccountForSimpleTransaction;
  transactionId: string;
}) {
  const payload = buildPayloadFromSimpleDraft(args);
  return toEditTransactionData(
    args.transactionId,
    payload.description,
    payload.bookings,
  );
}

export function createUpdateTransactionPayloadFromSimpleValues(args: {
  values: SimpleTransactionValues;
  allAccountOptions: AccountOption[];
  currentAccount: CurrentAccountForSimpleTransaction;
}) {
  const counterAccount = resolveCounterAccount(
    args.allAccountOptions,
    args.values.counterAccountId,
  );

  return buildSimpleTransactionValues({
    values: args.values,
    currentAccount: args.currentAccount,
    counterAccount,
  });
}
