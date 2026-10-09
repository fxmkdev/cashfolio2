import { program } from "commander";
import { exec } from "../shared";
import { createClient, type AnyRedisClientOptions } from "redis";

const redisClientOptions = {
  RESP: 2,
  commandOptions: {
    timeout: undefined,
  },
} satisfies AnyRedisClientOptions;

program.command("restore-local").action(async () => {
  console.log("Dropping local database…");
  await exec(
    `psql -d "${process.env.RESTORE_DB_URL}" -c "DROP DATABASE IF EXISTS ${process.env.RESTORE_DB_NAME} WITH (FORCE)"`,
  );
  console.log("Creating local database…");
  await exec(
    `psql -d "${process.env.RESTORE_DB_URL}" -c "CREATE DATABASE ${process.env.RESTORE_DB_NAME}"`,
  );

  console.log("Restoring local database from backup…");
  await exec(
    `pg_restore --no-owner --no-privileges -d "${process.env.RESTORE_DB_URL}/${process.env.RESTORE_DB_NAME}" ./backup.dump`,
  );

  console.log("Purging account-book keys from local Redis…");

  const redis = createClient({
    ...redisClientOptions,
    url: process.env.RESTORE_REDIS_URL,
  });
  await redis.connect();

  const keys = await redis.keys("account-book:*");
  console.log(`Found ${keys.length} keys to delete`);
  for (const key of keys) {
    await redis.del(key);
  }

  await redis.close();

  console.log("Done");
});
