import {
  deleteRestoreBookCaches,
  type BookCacheRedisClient,
} from "./book-cache-cleanup";

type RestoreRedisClient = BookCacheRedisClient & {
  isOpen: boolean;
  connect(): Promise<unknown>;
  close(): Promise<void>;
};

type RestoreDependencies = {
  env: {
    RESTORE_DB_URL?: string;
    RESTORE_DB_NAME?: string;
    RESTORE_REDIS_URL?: string;
  };
  exec(command: string): Promise<unknown>;
  createRedisClient(url: string): RestoreRedisClient;
  log(message: string): void;
};

export async function restoreLocal({
  env,
  exec,
  createRedisClient,
  log,
}: RestoreDependencies): Promise<void> {
  const redisUrl = env.RESTORE_REDIS_URL?.trim();
  if (!redisUrl)
    throw new Error(
      "RESTORE_REDIS_URL must be set before restoring the local database.",
    );

  log("Dropping local database…");
  await exec(
    `psql -d "${env.RESTORE_DB_URL}" -c "DROP DATABASE IF EXISTS ${env.RESTORE_DB_NAME} WITH (FORCE)"`,
  );
  log("Creating local database…");
  await exec(
    `psql -d "${env.RESTORE_DB_URL}" -c "CREATE DATABASE ${env.RESTORE_DB_NAME}"`,
  );
  log("Restoring local database from backup…");
  await exec(
    `pg_restore --no-owner --no-privileges -d "${env.RESTORE_DB_URL}/${env.RESTORE_DB_NAME}" ./backup.dump`,
  );

  log("Purging book-scoped caches from local Redis…");
  const redis = createRedisClient(redisUrl);
  try {
    await redis.connect();
    const deletedCount = await deleteRestoreBookCaches(redis);
    log(`Deleted ${deletedCount} book-scoped cache keys`);
  } finally {
    if (redis.isOpen) await redis.close();
  }
  log("Done");
}
