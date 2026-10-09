import { createClient, type AnyRedisClientOptions } from "redis";

const redisClientOptions = {
  RESP: 2,
  commandOptions: {
    timeout: undefined,
  },
} satisfies AnyRedisClientOptions;

function createRedisClient(redisUrl: string) {
  return createClient({
    ...redisClientOptions,
    url: redisUrl,
  });
}

type RedisClient = ReturnType<typeof createRedisClient>;

let redisClient: RedisClient | null = null;
let redisConnectPromise: Promise<RedisClient | null> | null = null;
let hasWarnedMissingRedisUrl = false;
let hasWarnedRedisUnavailable = false;

export async function getRedisClient(): Promise<RedisClient | null> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    if (!hasWarnedMissingRedisUrl) {
      console.warn(
        "REDIS_URL is not set; valuation rates will not be cached in Redis TimeSeries.",
      );
      hasWarnedMissingRedisUrl = true;
    }
    return null;
  }

  if (!redisClient) {
    redisClient = createRedisClient(redisUrl);
    redisClient.on("error", (error) => {
      console.error("Redis Client Error", error);
    });
  }

  if (!redisClient.isOpen) {
    redisConnectPromise ??= (async () => {
      try {
        await redisClient.connect();
        return redisClient;
      } catch (error) {
        if (!hasWarnedRedisUnavailable) {
          console.warn(
            "Unable to connect to Redis; continuing without valuation cache.",
            error,
          );
          hasWarnedRedisUnavailable = true;
        }
        return null;
      } finally {
        redisConnectPromise = null;
      }
    })();

    const connectedClient = await redisConnectPromise;
    if (!connectedClient || !connectedClient.isOpen) {
      return null;
    }
  }

  return redisClient;
}
