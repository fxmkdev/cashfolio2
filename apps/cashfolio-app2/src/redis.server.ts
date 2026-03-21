import { createClient, type RedisClientType } from "redis";

type RedisClient = RedisClientType;

let redisClient: RedisClient | null = null;
let redisConnectPromise: Promise<RedisClient> | null = null;
let hasWarnedMissingRedisUrl = false;

export async function getRedisClient(): Promise<RedisClient | null> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    if (!hasWarnedMissingRedisUrl) {
      console.warn(
        "REDIS_URL is not set; FX rates will not be cached in Redis TimeSeries.",
      );
      hasWarnedMissingRedisUrl = true;
    }
    return null;
  }

  if (!redisClient) {
    redisClient = createClient({ url: redisUrl });
    redisClient.on("error", (error) => {
      console.error("Redis Client Error", error);
    });
  }

  if (!redisClient.isOpen) {
    redisConnectPromise ??= redisClient.connect().catch((error) => {
      redisConnectPromise = null;
      throw error;
    });
    await redisConnectPromise;
  }

  return redisClient;
}
