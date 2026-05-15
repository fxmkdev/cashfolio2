import { program } from "commander";
import { Client } from "pg";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  isExpectedConfirmation,
  readSyncAccountBookConfig,
  sortAccountGroupsParentFirst,
  type SyncAccountBookConfig,
} from "./sync-account-book-helpers";

type AccountBookRow = {
  id: string;
  name: string;
  referenceCurrency: string;
  startDate: Date;
  createdAt: Date;
  updatedAt: Date;
};

type AccountGroupRow = {
  id: string;
  name: string;
  type: string;
  equityAccountSubtype: string | null;
  isActive: boolean;
  sortOrder: number | null;
  parentGroupId: string | null;
  accountBookId: string;
  createdAt: Date;
  updatedAt: Date;
};

type AccountRow = {
  id: string;
  name: string;
  type: string;
  equityAccountSubtype: string | null;
  isActive: boolean;
  sortOrder: number | null;
  groupId: string | null;
  unit: string | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  accountBookId: string;
  createdAt: Date;
  updatedAt: Date;
};

type TransactionRow = {
  id: string;
  description: string;
  accountBookId: string;
  createdAt: Date;
  updatedAt: Date;
};

type BookingRow = {
  id: string;
  date: Date;
  description: string;
  transactionId: string;
  accountId: string;
  unit: string;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  value: string;
  sortOrder: number;
  accountBookId: string;
};

type AccountBookData = {
  accountBook: AccountBookRow;
  accountGroups: AccountGroupRow[];
  accounts: AccountRow[];
  transactions: TransactionRow[];
  bookings: BookingRow[];
};

type RowCounts = {
  accountBooks: number;
  accountGroups: number;
  accounts: number;
  transactions: number;
  bookings: number;
  userAccountBookLinks: number;
};

const ACCOUNT_BOOK_COLUMNS = [
  "id",
  "name",
  "referenceCurrency",
  "startDate",
  "createdAt",
  "updatedAt",
] as const;

const ACCOUNT_GROUP_COLUMNS = [
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

const ACCOUNT_COLUMNS = [
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

const TRANSACTION_COLUMNS = [
  "id",
  "description",
  "accountBookId",
  "createdAt",
  "updatedAt",
] as const;

const BOOKING_COLUMNS = [
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

program
  .command("sync-account-book")
  .description("Copy one account book from production to staging.")
  .action(async () => {
    try {
      const config = readSyncAccountBookConfig(process.env);
      await syncAccountBook(config);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

async function syncAccountBook(config: SyncAccountBookConfig) {
  const source = new Client({
    connectionString: config.prodDatabaseReadonlyUrl,
  });
  const target = new Client({ connectionString: config.stagingDatabaseUrl });

  try {
    console.log("Connecting to source and target databases...");
    await source.connect();
    await target.connect();

    const data = await fetchSourceAccountBook(source, config.accountBookId);
    const sourceCounts = getSourceCounts(data);
    const targetCounts = await fetchTargetCounts(target, config.accountBookId);

    console.log(`Source account book: ${data.accountBook.id}`);
    logCounts("Rows to copy", sourceCounts);
    logCounts("Existing target rows to replace", targetCounts);

    await confirmReplacement(config.accountBookId);

    const importResult = await replaceTargetAccountBook(
      target,
      data,
      config.targetUserExternalId,
    );

    logCounts("Deleted target rows", importResult.deletedCounts);
    if (importResult.generatedGainLossAccountsDeleted > 0) {
      console.log(
        `Deleted trigger-created Gain/Loss accounts: ${importResult.generatedGainLossAccountsDeleted}`,
      );
    }
    logCounts("Copied rows", importResult.copiedCounts);
    console.log("Done");
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

async function fetchSourceAccountBook(
  client: Client,
  accountBookId: string,
): Promise<AccountBookData> {
  await client.query("BEGIN TRANSACTION READ ONLY");

  try {
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

    const accountGroups = await queryRows<AccountGroupRow>(
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
    const accounts = await queryRows<AccountRow>(
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
    const transactions = await queryRows<TransactionRow>(
      client,
      `
        SELECT "id", "description", "accountBookId", "createdAt", "updatedAt"
        FROM "Transaction"
        WHERE "accountBookId" = $1
      `,
      [accountBookId],
    );
    const bookings = await queryRows<BookingRow>(
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

    await client.query("COMMIT");

    return {
      accountBook: accountBooks[0]!,
      accountGroups: sortAccountGroupsParentFirst(accountGroups),
      accounts,
      transactions,
      bookings,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function fetchTargetCounts(client: Client, accountBookId: string) {
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

async function confirmReplacement(accountBookId: string) {
  const expected = `replace ${accountBookId}`;
  const readline = createInterface({ input, output });

  try {
    const confirmation = await readline.question(
      `Type '${expected}' to delete and replace staging data: `,
    );

    if (!isExpectedConfirmation(confirmation, accountBookId)) {
      throw new Error("Confirmation did not match; aborting.");
    }
  } finally {
    readline.close();
  }
}

async function replaceTargetAccountBook(
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

    const generatedGainLossDelete = await client.query(
      `
        DELETE FROM "Account"
        WHERE "accountBookId" = $1
          AND "type" = 'EQUITY'
          AND "equityAccountSubtype" = 'GAIN_LOSS'
      `,
      [data.accountBook.id],
    );

    await insertRows(
      client,
      `"AccountGroup"`,
      ACCOUNT_GROUP_COLUMNS,
      data.accountGroups,
    );
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
      INSERT INTO "User" ("id", "externalId", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, $1, NOW(), NOW())
      ON CONFLICT ("externalId") DO UPDATE
      SET "externalId" = EXCLUDED."externalId"
      RETURNING "id"
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

function getSourceCounts(
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

function logCounts(label: string, counts: RowCounts) {
  console.log(`${label}:`);
  console.log(`  AccountBook: ${counts.accountBooks}`);
  console.log(`  AccountGroup: ${counts.accountGroups}`);
  console.log(`  Account: ${counts.accounts}`);
  console.log(`  Transaction: ${counts.transactions}`);
  console.log(`  Booking: ${counts.bookings}`);
  console.log(`  UserAccountBookLink: ${counts.userAccountBookLinks}`);
}
