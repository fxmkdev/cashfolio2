import { createId } from "@paralleldrive/cuid2";
import { getRedisClient } from "../../../redis.server";
import { getAccountReturnWorkKey } from "../../../shared/book-cache-keys";
import type { AccountReturnDetails } from "../../../shared/account-returns";
import type { ValuationRateSource } from "../../valuation/types";
import {
  createCacheFailureReporter,
  readValidatedMoneyCache,
} from "../../money-cache-read";
import { getPeriodCacheEnvOrThrowWhenRedisAvailable } from "../../period/cache/period-cache";
import { isAccountReturnResult } from "./return-cache.server";
import type { ReturnRateRequest } from "./return-engine";

export type ReturnWorkState = {
  binding: string;
  sequence: number;
  revision: string;
  asOfDate: string;
  publication: string;
  referenceCurrency: string;
  phase: "capital" | "valuation" | "calculation";
  requests: ReturnRateRequest[];
  offset: number;
  rates: Record<string, { rate: string | null; source: ValuationRateSource }>;
  results: AccountReturnDetails[];
};
const TTL = 15 * 60;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_LOCAL_BYTES = 64 * 1024 * 1024;
const local = new Map<string, { expires: number; encoded: string }>();
const reportRead = createCacheFailureReporter(
  "Failed to read return work; continuing with the local checkpoint.",
);
const reportWrite = createCacheFailureReporter(
  "Failed to save return work; continuing with the local checkpoint.",
);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const day = (v: unknown) =>
  text(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v));
const nullableText = (v: unknown) => v === null || text(v);
const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const nullableNumber = (v: unknown) => v === null || finite(v);

function validState(v: unknown): v is ReturnWorkState {
  return (
    record(v) &&
    text(v.binding) &&
    typeof v.sequence === "number" &&
    Number.isSafeInteger(v.sequence) &&
    v.sequence >= 0 &&
    text(v.revision) &&
    day(v.asOfDate) &&
    day(v.publication) &&
    text(v.referenceCurrency) &&
    ["capital", "valuation", "calculation"].includes(String(v.phase)) &&
    Array.isArray(v.requests) &&
    v.requests.length <= 100_000 &&
    v.requests.every(
      (r) =>
        record(r) &&
        ["CURRENCY", "CRYPTOCURRENCY", "SECURITY"].includes(String(r.unit)) &&
        day(r.date) &&
        [r.currency, r.cryptocurrency, r.symbol, r.tradeCurrency].every(
          nullableText,
        ),
    ) &&
    Number.isSafeInteger(v.offset) &&
    typeof v.offset === "number" &&
    v.offset >= 0 &&
    v.offset <= v.requests.length &&
    record(v.rates) &&
    Object.values(v.rates).every(
      (r) =>
        record(r) &&
        (r.rate === null ||
          (text(r.rate) &&
            /^\d+(\.\d+)?(e[+-]?\d+)?$/i.test(r.rate) &&
            Number.isFinite(Number(r.rate)))) &&
        ["identity", "timeSeries", "provider", "fallback", "missing"].includes(
          String(r.source),
        ),
    ) &&
    Array.isArray(v.results) &&
    v.results.every(
      (r: unknown) =>
        record(r) &&
        text(r.name) &&
        text(r.referenceCurrency) &&
        day(r.startDate) &&
        day(r.asOfDate) &&
        Array.isArray(r.valuations) &&
        r.valuations.every(
          (p) =>
            record(p) &&
            text(p.id) &&
            day(p.date) &&
            day(p.startDate) &&
            [p.openingValue, p.closingValue, p.factor].every(nullableNumber) &&
            [p.contributions, p.withdrawals].every(finite),
        ) &&
        Array.isArray(r.cashFlows) &&
        r.cashFlows.every(
          (f) =>
            record(f) &&
            text(f.id) &&
            day(f.date) &&
            finite(f.amount) &&
            nullableText(f.transactionId) &&
            text(f.description),
        ) &&
        isAccountReturnResult(r),
    )
  );
}

function prune() {
  let bytes = 0;
  for (const [key, entry] of local) {
    if (entry.expires <= Date.now()) local.delete(key);
    else bytes += Buffer.byteLength(entry.encoded);
  }
  while (local.size > 16 || bytes > MAX_LOCAL_BYTES) {
    const key = local.keys().next().value;
    if (!key) break;
    bytes -= Buffer.byteLength(local.get(key)!.encoded);
    local.delete(key);
  }
}

export async function returnWorkStore(accountBookId: string, userId: string) {
  const redis = await getRedisClient();
  const cacheEnv = redis
    ? getPeriodCacheEnvOrThrowWhenRedisAvailable()
    : "local";
  const keyFor = (id: string) =>
    getAccountReturnWorkKey({ cacheEnv, accountBookId, userId, id });
  const localKey = (id: string) => JSON.stringify([accountBookId, userId, id]);
  return {
    createId,
    async read(id: string) {
      prune();
      const key = keyFor(id);
      const cached = redis
        ? await readValidatedMoneyCache({
            read: () => redis.get(key),
            maxBytes: MAX_BYTES,
            validate: validState,
            reportFailure: reportRead,
          })
        : undefined;
      const entry = local.get(localKey(id));
      const memory = entry
        ? await readValidatedMoneyCache({
            read: async () => entry.encoded,
            maxBytes: MAX_BYTES,
            validate: validState,
            reportFailure: reportRead,
          })
        : undefined;
      return memory && (!cached || memory.sequence >= cached.sequence)
        ? memory
        : cached;
    },
    async save(id: string, state: ReturnWorkState) {
      state.sequence++;
      const encoded = JSON.stringify(state);
      if (Buffer.byteLength(encoded) > MAX_BYTES)
        throw new Error(
          "Return calculation exceeds the supported checkpoint size.",
        );
      const key = keyFor(id);
      local.delete(localKey(id));
      local.set(localKey(id), { expires: Date.now() + TTL * 1000, encoded });
      prune();
      if (redis)
        try {
          await redis.setEx(key, TTL, encoded);
        } catch (e) {
          reportWrite(e);
        }
    },
    async remove(id: string) {
      const key = keyFor(id);
      local.delete(localKey(id));
      if (redis)
        try {
          await redis.del(key);
        } catch (e) {
          reportWrite(e);
        }
    },
  };
}
