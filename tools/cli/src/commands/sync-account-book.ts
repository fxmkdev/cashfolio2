import { program } from "commander";
import { Client } from "pg";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  fetchSourceAccountBook,
  fetchTargetCounts,
  getSourceCounts,
  replaceTargetAccountBook,
} from "./sync-account-book-db";
import {
  isExpectedConfirmation,
  readSyncAccountBookConfig,
  type SyncAccountBookConfig,
} from "./sync-account-book-helpers";
import type { RowCounts } from "./sync-account-book-types";

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
    const sourceCounts = getSourceCounts(data, 1);
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

function logCounts(label: string, counts: RowCounts) {
  console.log(`${label}:`);
  console.log(`  AccountBook: ${counts.accountBooks}`);
  console.log(`  AccountGroup: ${counts.accountGroups}`);
  console.log(`  Account: ${counts.accounts}`);
  console.log(`  Transaction: ${counts.transactions}`);
  console.log(`  Booking: ${counts.bookings}`);
  console.log(`  UserAccountBookLink: ${counts.userAccountBookLinks}`);
}
