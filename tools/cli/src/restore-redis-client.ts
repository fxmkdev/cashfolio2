import { createClient, type AnyRedisClientOptions } from "redis";

const redisClientOptions = {
  RESP: 2,
  commandOptions: { timeout: undefined },
  // A one-shot restore must reject connection failures rather than retry forever.
  socket: { reconnectStrategy: false, connectTimeout: 5000 },
} satisfies AnyRedisClientOptions;

export function createRestoreRedisClient(
  url: string,
  onError: (error: Error) => void = (error) =>
    console.error("Restore Redis client error", error),
) {
  const redis = createClient({ ...redisClientOptions, url });
  redis.on("error", onError);
  return redis;
}
