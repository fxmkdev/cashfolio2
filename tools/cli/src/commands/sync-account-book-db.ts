import { Client } from "pg";
import {
  ACCOUNT_BOOK_COLUMNS,
  ACCOUNT_COLUMNS,
  ACCOUNT_GROUP_COLUMNS,
  BOOKING_COLUMNS,
  TRANSACTION_COLUMNS,
} from "./sync-account-book-columns";
import {
  hasGainLossAccount,
  withoutAccountGroupParentIds,
} from "./sync-account-book-helpers";
import type {
  AccountBookData,
  AccountBookRow,
  AccountGroupRow,
  AccountRow,
  BookingRow,
  RowCounts,
  TransactionRow,
} from "./sync-account-book-types";

export async function fetchSourceAccountBook(
  client: Client,
  accountBookId: string,
): Promise<AccountBookData> {
  await client.query("BEGIN TRANSACTION READ ONLY");

  try {
    const accountBook = await fetchSourceAccountBookRow(client, accountBookId);
    const accountGroups = await fetchSourceAccountGroups(client, accountBookId);
    const accounts = await fetchSourceAccounts(client, accountBookId);
    const transactions = await fetchSourceTransactions(client, accountBookId);
    const bookings = await fetchSourceBookings(client, accountBookId);

    await client.query("COMMIT");

    return { accountBook, accountGroups, accounts, transactions, bookings };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function fetchSourceAccountBookRow(
  client: Client,
  accountBookId: string,
) {
  const accountBooks = await queryRows<AccountBookRow>(
    client,
    `
      SELECT "id", "name", "referenceCurrency", "startDate", "createdAt", "updatedAt"
      FROM "AccountBook"
      WHERE "id" = $1
    `,
    [accountBookId],
  );

  if (accountBooks.length === 0) {
    throw new Error(`Source account book '${accountBookId}' was not found.`);
  }

  return accountBooks[0]!;
}

async function fetchSourceAccountGroups(client: Client, accountBookId: string) {
  return queryRows<AccountGroupRow>(
    client,
    `
      SELECT
        "id", "name", "type", "equityAccountSubtype", "isActive", "sortOrder",
        "parentGroupId", "accountBookId", "createdAt", "updatedAt"
      FROM "AccountGroup"
      WHERE "accountBookId" = $1
    `,
    [accountBookId],
  );
}

async function fetchSourceAccounts(client: Client, accountBookId: string) {
  return queryRows<AccountRow>(
    client,
    `
      SELECT
        "id", "name", "type", "equityAccountSubtype", "isActive", "sortOrder",
        "groupId", "unit", "currency", "cryptocurrency", "symbol",
        "tradeCurrency", "accountBookId", "createdAt", "updatedAt"
      FROM "Account"
      WHERE "accountBookId" = $1
    `,
    [accountBookId],
  );
}

async function fetchSourceTransactions(client: Client, accountBookId: string) {
  return queryRows<TransactionRow>(
    client,
    `
      SELECT "id", "description", "accountBookId", "createdAt", "updatedAt"
      FROM "Transaction"
      WHERE "accountBookId" = $1
    `,
    [accountBookId],
  );
}

async function fetchSourceBookings(client: Client, accountBookId: string) {
  return queryRows<BookingRow>(
    client,
    `
      SELECT
        "id", "date", "description", "transactionId", "accountId", "unit",
        "currency", "cryptocurrency", "symbol", "tradeCurrency", "value",
        "sortOrder", "accountBookId"
      FROM "Booking"
      WHERE "accountBookId" = $1
    `,
    [accountBookId],
  );
}

export async function fetchTargetCounts(client: Client, accountBookId: string) {
  const result = await client.query<RowCounts>(
    `
      SELECT
        (SELECT COUNT(*)::int FROM "AccountBook" WHERE "id" = $1) AS "accountBooks",
        (SELECT COUNT(*)::int FROM "AccountGroup" WHERE "accountBookId" = $1) AS "accountGroups",
        (SELECT COUNT(*)::int FROM "Account" WHERE "accountBookId" = $1) AS "accounts",
        (SELECT COUNT(*)::int FROM "Transaction" WHERE "accountBookId" = $1) AS "transactions",
        (SELECT COUNT(*)::int FROM "Booking" WHERE "accountBookId" = $1) AS "bookings",
        (SELECT COUNT(*)::int FROM "UserAccountBookLink" WHERE "accountBookId" = $1) AS "userAccountBookLinks"
    `,
    [accountBookId],
  );

  return result.rows[0]!;
}

export async function replaceTargetAccountBook(
  client: Client,
  data: AccountBookData,
  targetUserExternalId: string,
) {
  await client.query("BEGIN");

  try {
    const deletedCounts = await deleteTargetAccountBook(
      client,
      data.accountBook.id,
    );

    await insertRows(client, `"AccountBook"`, ACCOUNT_BOOK_COLUMNS, [
      data.accountBook,
    ]);

    const generatedGainLossDelete = hasGainLossAccount(data.accounts)
      ? await deleteGeneratedGainLossAccount(client, data.accountBook.id)
      : { rowCount: 0 };

    await insertRows(
      client,
      `"AccountGroup"`,
      ACCOUNT_GROUP_COLUMNS,
      withoutAccountGroupParentIds(data.accountGroups),
    );
    await restoreAccountGroupParents(client, data.accountGroups);
    await insertRows(client, `"Account"`, ACCOUNT_COLUMNS, data.accounts);
    await insertRows(
      client,
      `"Transaction"`,
      TRANSACTION_COLUMNS,
      data.transactions,
    );
    await insertRows(client, `"Booking"`, BOOKING_COLUMNS, data.bookings);

    await createTargetUserLink(
      client,
      targetUserExternalId,
      data.accountBook.id,
    );

    await client.query("COMMIT");

    return {
      deletedCounts,
      generatedGainLossAccountsDeleted: generatedGainLossDelete.rowCount ?? 0,
      copiedCounts: getSourceCounts(data, 1),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function deleteGeneratedGainLossAccount(
  client: Client,
  accountBookId: string,
) {
  return client.query(
    `
      DELETE FROM "Account"
      WHERE "accountBookId" = $1
        AND "type" = 'EQUITY'
        AND "equityAccountSubtype" = 'GAIN_LOSS'
    `,
    [accountBookId],
  );
}

async function restoreAccountGroupParents(
  client: Client,
  accountGroups: AccountGroupRow[],
) {
  for (const group of accountGroups) {
    if (group.parentGroupId === null) {
      continue;
    }

    await client.query(
      `
        UPDATE "AccountGroup"
        SET "parentGroupId" = $1
        WHERE "id" = $2
          AND "accountBookId" = $3
      `,
      [group.parentGroupId, group.id, group.accountBookId],
    );
  }
}

async function deleteTargetAccountBook(
  client: Client,
  accountBookId: string,
): Promise<RowCounts> {
  const userLinks = await client.query(
    `DELETE FROM "UserAccountBookLink" WHERE "accountBookId" = $1`,
    [accountBookId],
  );
  const bookings = await client.query(
    `DELETE FROM "Booking" WHERE "accountBookId" = $1`,
    [accountBookId],
  );
  const transactions = await client.query(
    `DELETE FROM "Transaction" WHERE "accountBookId" = $1`,
    [accountBookId],
  );
  const accounts = await client.query(
    `DELETE FROM "Account" WHERE "accountBookId" = $1`,
    [accountBookId],
  );

  await client.query(
    `
      UPDATE "AccountGroup"
      SET "parentGroupId" = NULL
      WHERE "accountBookId" = $1
    `,
    [accountBookId],
  );

  const accountGroups = await client.query(
    `DELETE FROM "AccountGroup" WHERE "accountBookId" = $1`,
    [accountBookId],
  );
  const accountBooks = await client.query(
    `DELETE FROM "AccountBook" WHERE "id" = $1`,
    [accountBookId],
  );

  return {
    accountBooks: accountBooks.rowCount ?? 0,
    accountGroups: accountGroups.rowCount ?? 0,
    accounts: accounts.rowCount ?? 0,
    transactions: transactions.rowCount ?? 0,
    bookings: bookings.rowCount ?? 0,
    userAccountBookLinks: userLinks.rowCount ?? 0,
  };
}

async function createTargetUserLink(
  client: Client,
  externalId: string,
  accountBookId: string,
) {
  const userResult = await client.query<{ id: string }>(
    `
      WITH inserted AS (
        INSERT INTO "User" ("id", "externalId", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, NOW(), NOW())
        ON CONFLICT ("externalId") DO NOTHING
        RETURNING "id"
      )
      SELECT "id" FROM inserted
      UNION ALL
      SELECT "id" FROM "User" WHERE "externalId" = $1
      LIMIT 1
    `,
    [externalId],
  );

  const userId = userResult.rows[0]!.id;

  await client.query(
    `
      INSERT INTO "UserAccountBookLink" ("userId", "accountBookId")
      VALUES ($1, $2)
      ON CONFLICT ("userId", "accountBookId") DO NOTHING
    `,
    [userId, accountBookId],
  );
}

async function insertRows<T extends object>(
  client: Client,
  tableName: string,
  columns: readonly (keyof T & string)[],
  rows: T[],
) {
  if (rows.length === 0) {
    return;
  }

  const chunkSize = Math.max(1, Math.floor(60000 / columns.length));

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const values: unknown[] = [];
    const placeholders = chunk.map((row) => {
      const rowPlaceholders = columns.map((column) => {
        values.push(row[column]);
        return `$${values.length}`;
      });

      return `(${rowPlaceholders.join(", ")})`;
    });
    const quotedColumns = columns.map((column) => `"${column}"`).join(", ");

    await client.query(
      `
        INSERT INTO ${tableName} (${quotedColumns})
        VALUES ${placeholders.join(", ")}
      `,
      values,
    );
  }
}

async function queryRows<T>(
  client: Client,
  query: string,
  values: unknown[],
): Promise<T[]> {
  const result = await client.query(query, values);
  return result.rows as T[];
}

export function getSourceCounts(
  data: AccountBookData,
  userAccountBookLinks = 0,
): RowCounts {
  return {
    accountBooks: 1,
    accountGroups: data.accountGroups.length,
    accounts: data.accounts.length,
    transactions: data.transactions.length,
    bookings: data.bookings.length,
    userAccountBookLinks,
  };
}
