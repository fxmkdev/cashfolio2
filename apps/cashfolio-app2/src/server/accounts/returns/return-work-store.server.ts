import { createId } from "@paralleldrive/cuid2";
import { getRedisClient } from "../../../redis.server";
import { getAccountReturnWorkKey } from "../../../shared/accounts/book-cache-keys";
import { getPeriodCacheEnvOrThrowWhenRedisAvailable } from "../../period/cache/period-cache.server";
import { rethrowResourceError } from "../../resource-error";
import type { HistoryFailure } from "../../valuation/history/types";
export type ReturnWorkState = {
  binding: string;
  context: string;
  revision: string;
  asOfDate: string;
  publication: string;
  planId: string;
  createdAt: number;
  sequence: number;
  done: string[];
  failures: Record<string, HistoryFailure>;
  phase: "history" | "calculation" | "complete";
  validUntil: number;
};
const TTL = 900;
const local = new Map<string, { state: ReturnWorkState; expires: number }>();
const indices = new Map<string, { id: string; expires: number }>();
const busy = new Set<string>();
let warned = false;
const warning = (error: unknown) => {
  rethrowResourceError(error);
  if (!warned) {
    warned = true;
    console.warn(
      "Return work cache unavailable; using bounded local checkpoints.",
    );
  }
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function valid(v: unknown): v is ReturnWorkState {
  return (
    record(v) &&
    [
      v.binding,
      v.context,
      v.revision,
      v.asOfDate,
      v.publication,
      v.planId,
    ].every((s) => typeof s === "string") &&
    typeof v.sequence === "number" &&
    Number.isSafeInteger(v.sequence) &&
    v.sequence >= 0 &&
    typeof v.createdAt === "number" &&
    Number.isFinite(v.createdAt) &&
    typeof v.validUntil === "number" &&
    Number.isFinite(v.validUntil) &&
    ["history", "calculation", "complete"].includes(String(v.phase)) &&
    Array.isArray(v.done) &&
    v.done.length <= 10_000 &&
    v.done.every((s) => typeof s === "string") &&
    record(v.failures) &&
    Object.values(v.failures).every(
      (f) =>
        record(f) &&
        typeof f.attempts === "number" &&
        Number.isSafeInteger(f.attempts) &&
        f.attempts >= 0 &&
        typeof f.retryAt === "number" &&
        Number.isFinite(f.retryAt),
    )
  );
}
function prune() {
  for (const [k, v] of local) if (v.expires <= Date.now()) local.delete(k);
  for (const [k, v] of indices) if (v.expires <= Date.now()) indices.delete(k);
  while (local.size > 16) local.delete(local.keys().next().value!);
  while (indices.size > 64) indices.delete(indices.keys().next().value!);
}
export async function returnWorkStore(accountBookId: string, userId: string) {
  const redis = await getRedisClient();
  const cacheEnv = redis
    ? getPeriodCacheEnvOrThrowWhenRedisAvailable()
    : "local";
  const key = (id: string) =>
    getAccountReturnWorkKey({ cacheEnv, accountBookId, userId, id });
  const memoryKey = (id: string) => `${accountBookId}:${userId}:${id}`;
  return {
    createId,
    async indexed(context: string, proposed: string) {
      prune();
      const name = memoryKey(`index:${context}`);
      if (redis)
        try {
          const indexKey = key(`index:${context}`);
          let id = await redis.lIndex(indexKey, -1);
          if (!id) {
            await redis.lPush(indexKey, proposed);
            await redis.expire(indexKey, TTL);
            id = (await redis.lIndex(indexKey, -1)) ?? proposed;
            if (id !== proposed) await redis.lRem(indexKey, 1, proposed);
          }
          indices.set(name, { id, expires: Date.now() + TTL * 1000 });
          return id;
        } catch (e) {
          warning(e);
        }
      const existing = indices.get(name);
      if (existing) return existing.id;
      indices.set(name, { id: proposed, expires: Date.now() + TTL * 1000 });
      return proposed;
    },
    async invalidate(context: string, id: string) {
      const name = memoryKey(`index:${context}`);
      if (indices.get(name)?.id === id) indices.delete(name);
      if (redis)
        try {
          await redis.lRem(key(`index:${context}`), 1, id);
        } catch (e) {
          rethrowResourceError(e);
        }
    },
    async read(id: string) {
      prune();
      let remote: ReturnWorkState | undefined;
      if (redis)
        try {
          const raw = await redis.get(key(id));
          if (raw && raw.length <= 256 * 1024) {
            const value: unknown = JSON.parse(raw);
            if (valid(value)) remote = value;
          }
        } catch (e) {
          rethrowResourceError(e);
        }
      const memory = local.get(memoryKey(id))?.state;
      const value =
        memory && (!remote || memory.sequence > remote.sequence)
          ? memory
          : remote;
      // Work state is mutable. Never hand two callers the same object.
      return value ? structuredClone(value) : undefined;
    },
    async save(id: string, state: ReturnWorkState) {
      state.sequence++;
      const raw = JSON.stringify(state);
      if (raw.length > 256 * 1024)
        throw new Error("Return work exceeds its supported checkpoint size.");
      local.set(memoryKey(id), {
        state: structuredClone(state),
        expires: Date.now() + TTL * 1000,
      });
      prune();
      const index = memoryKey(`index:${state.context}`);
      if (indices.get(index)?.id === id)
        indices.set(index, { id, expires: Date.now() + TTL * 1000 });
      if (redis)
        try {
          await redis.setEx(key(id), TTL, raw);
          await redis.expire(key(`index:${state.context}`), TTL);
        } catch (e) {
          warning(e);
        }
    },
    async lease(id: string) {
      const name = memoryKey(id);
      const token = JSON.stringify({
        id: createId(),
        expires: Date.now() + 65_000,
      });
      const leaseKey = key(`lease:${id}`);
      if (busy.has(name)) return;
      busy.add(name);
      if (redis)
        try {
          // FIFO insertion and removal of a unique token require only the
          // existing +@read/+@write ACL. No Lua, transactions, or unsafe DEL.
          await redis.lPush(leaseKey, token);
          await redis.expire(leaseKey, 65);
          let owner = await redis.lIndex(leaseKey, -1);
          for (
            let expired = 0;
            owner && owner !== token && expired < 16;
            expired++
          ) {
            let expiry = 0;
            try {
              const value: unknown = JSON.parse(owner);
              if (record(value) && typeof value.expires === "number")
                expiry = value.expires;
            } catch {
              /* Remove corrupt tokens as well as abandoned ones. */
            }
            if (expiry > Date.now()) break;
            await redis.lRem(leaseKey, 1, owner);
            owner = await redis.lIndex(leaseKey, -1);
          }
          if (owner !== token) {
            await redis.lRem(leaseKey, 1, token);
            busy.delete(name);
            return;
          }
        } catch (e) {
          await redis.lRem(leaseKey, 1, token).catch(() => {});
          try {
            warning(e);
          } catch (resource) {
            busy.delete(name);
            throw resource;
          }
        }

      return async () => {
        busy.delete(name);
        if (redis)
          try {
            await redis.lRem(leaseKey, 1, token);
          } catch (e) {
            rethrowResourceError(e);
          }
      };
    },
    async remove(id: string) {
      local.delete(memoryKey(id));
      if (redis)
        try {
          await redis.del(key(id));
        } catch (e) {
          rethrowResourceError(e);
        }
    },
  };
}
