export const ACCOUNT_BOOK_COLUMNS = [
  "id",
  "name",
  "referenceCurrency",
  "startDate",
  "createdAt",
  "updatedAt",
] as const;

export const ACCOUNT_GROUP_COLUMNS = [
  "id",
  "name",
  "type",
  "equityAccountSubtype",
  "isActive",
  "sortOrder",
  "parentGroupId",
  "accountBookId",
  "createdAt",
  "updatedAt",
] as const;

export const ACCOUNT_COLUMNS = [
  "id",
  "name",
  "type",
  "equityAccountSubtype",
  "isActive",
  "sortOrder",
  "groupId",
  "unit",
  "currency",
  "cryptocurrency",
  "symbol",
  "tradeCurrency",
  "accountBookId",
  "createdAt",
  "updatedAt",
] as const;

export const TRANSACTION_COLUMNS = [
  "id",
  "description",
  "accountBookId",
  "createdAt",
  "updatedAt",
] as const;

export const BOOKING_COLUMNS = [
  "id",
  "date",
  "description",
  "transactionId",
  "accountId",
  "unit",
  "currency",
  "cryptocurrency",
  "symbol",
  "tradeCurrency",
  "value",
  "sortOrder",
  "accountBookId",
] as const;
