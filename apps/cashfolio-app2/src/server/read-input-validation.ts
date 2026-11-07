import { assertRecord, requireStringField } from "./input-validation";

export function readAccountBookInput(data: unknown) {
  assertRecord(data);
  return { accountBookId: requireStringField(data, "accountBookId") };
}

export function readAccountInput(data: unknown) {
  assertRecord(data);
  return {
    ...readAccountBookInput(data),
    accountId: requireStringField(data, "accountId"),
  };
}

export function readTransactionInput(data: unknown) {
  assertRecord(data);
  return {
    ...readAccountBookInput(data),
    transactionId: requireStringField(data, "transactionId"),
  };
}
