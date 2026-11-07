import { createHash } from "node:crypto";
import { getRedisClient } from "../../../redis.server";
import { getAccountReturnWorkKey } from "../../../shared/book-cache-keys";
import { getPeriodCacheEnvOrThrowWhenRedisAvailable } from "../../period/cache/period-cache";
import { encodeMoneyCache, decodeMoneyCache } from "../../money-cache-codec";
import { rethrowResourceError } from "../../resource-error";
export const returnArtifactId = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const local = new Map<
  string,
  { value: unknown; bytes: number; expires: number }
>();
const MAX_BYTES = 8 * 1024 * 1024;
let warned = false;
function warning(error: unknown) {
  rethrowResourceError(error);
  if (!warned) {
    warned = true;
    console.warn(
      "Return artifact cache unavailable; using bounded local data.",
    );
  }
}
function prune() {
  let bytes = 0;
  for (const [key, e] of local) {
    if (e.expires <= Date.now()) local.delete(key);
    else bytes += e.bytes;
  }
  while (bytes > 64 * 1024 * 1024 || local.size > 4096) {
    const key = local.keys().next().value;
    if (!key) break;
    bytes -= local.get(key)!.bytes;
    local.delete(key);
  }
}
/** Immutable basis, plans and individual results have separate bounded lifetimes. */
export async function returnArtifacts(accountBookId: string) {
  const redis = await getRedisClient();
  const cacheEnv = redis
    ? getPeriodCacheEnvOrThrowWhenRedisAvailable()
    : "local";
  const memoryKey = (id: string) => `${accountBookId}:${id}`;
  const keyFor = (id: string) =>
    getAccountReturnWorkKey({
      cacheEnv,
      accountBookId,
      userId: "shared",
      id: `artifact:${id}`,
    });
  return {
    async read<T>(
      id: string,
      validate: (v: unknown) => v is T,
    ): Promise<T | undefined> {
      prune();
      const memory = local.get(memoryKey(id));
      if (memory && validate(memory.value)) return memory.value;
      if (!redis) return;
      try {
        const [raw, ttl] = await Promise.all([
          redis.get(keyFor(id)),
          redis.pTTL(keyFor(id)),
        ]);
        if (!raw || raw.length > MAX_BYTES || ttl <= 0) return;
        const value: unknown = decodeMoneyCache(JSON.parse(raw));
        if (!validate(value)) return;
        local.set(memoryKey(id), {
          value,
          bytes: Buffer.byteLength(raw),
          expires: Date.now() + Math.min(ttl, 15 * 60 * 1000),
        });
        prune();
        return value;
      } catch (error) {
        warning(error);
      }
    },
    async save<T>(id: string, value: T, validUntil: number) {
      const ttl = Math.min(86400, Math.floor((validUntil - Date.now()) / 1000));
      if (ttl <= 0) return;
      const raw = JSON.stringify(encodeMoneyCache(value));
      const bytes = Buffer.byteLength(raw);
      if (bytes > MAX_BYTES)
        throw new Error(
          "Return calculation exceeds the supported artifact size.",
        );
      local.set(memoryKey(id), {
        value,
        bytes,
        expires: Math.min(validUntil, Date.now() + 15 * 60 * 1000),
      });
      prune();
      if (redis)
        try {
          await redis.setEx(keyFor(id), ttl, raw);
        } catch (error) {
          warning(error);
        }
    },
  };
}
