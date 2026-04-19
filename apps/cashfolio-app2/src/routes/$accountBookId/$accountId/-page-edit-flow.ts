import type { AccountOption } from "../../../components/edit-transaction-modal";
import type { SimpleTransactionDraftValues } from "../../../components/simple-transaction-modal";
import {
  buildSimpleTransactionValues,
  normalizeSimpleDraft,
  toCreateSplitInitialValues,
  toEditTransactionData,
  type SimpleTransactionEditInitialValues,
} from "./-page-transaction-utils";
import type { SimpleTransactionValues } from "./-page-view";

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
}) {
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
