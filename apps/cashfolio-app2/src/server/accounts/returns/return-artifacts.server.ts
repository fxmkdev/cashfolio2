import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { getRedisClient } from "../../../redis.server";
import { getAccountReturnWorkKey } from "../../../shared/accounts/book-cache-keys";
import { getPeriodCacheEnvOrThrowWhenRedisAvailable } from "../../period/cache/period-cache.server";
import { serializeServerError } from "../../error-logging.server";
import { checkResourceBudget } from "../../resource-context.server";
import { rethrowResourceError } from "../../resource-error";
import {
  createReturnArtifactDecoder,
  encodeReturnArtifact,
  RETURN_ARTIFACT_CHUNK_BYTES,
} from "./return-artifact-codec.server";

export const returnArtifactId = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");
const LOCAL_BYTES = 64 * 1024 * 1024;
const local = new Map<
  string,
  { value: unknown; bytes: number; expires: number }
>();
type Chunk = { hash: string; bytes: number };
type Manifest = {
  version: 1;
  generation: string;
  expires: number;
  bytes: number;
  chunks: Chunk[];
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const positiveInteger = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;
function validManifest(v: unknown): v is Manifest {
  return (
    record(v) &&
    v.version === 1 &&
    typeof v.generation === "string" &&
    /^[a-z0-9]{24}$/.test(v.generation) &&
    positiveInteger(v.expires) &&
    v.expires > Date.now() &&
    positiveInteger(v.bytes) &&
    Array.isArray(v.chunks) &&
    v.chunks.length > 0 &&
    v.chunks.every(
      (c) =>
        record(c) &&
        typeof c.hash === "string" &&
        /^[a-f0-9]{64}$/.test(c.hash) &&
        positiveInteger(c.bytes) &&
        c.bytes <= RETURN_ARTIFACT_CHUNK_BYTES,
    ) &&
    v.chunks.reduce((sum, c: Chunk) => sum + c.bytes, 0) === v.bytes
  );
}
let warned = false;
async function warning(
  error: unknown,
  operation: string,
  artifactId: string,
  chunkCount: number,
  bytes: number,
) {
  rethrowResourceError(error);
  if (warned) return;
  warned = true;
  console.warn("Return artifact cache unavailable; using bounded local data.", {
    operation,
    artifactId,
    chunkCount,
    bytes,
    chunkLimitBytes: RETURN_ARTIFACT_CHUNK_BYTES,
    error: await serializeServerError(error),
  });
}
function prune() {
  let bytes = 0;
  for (const [key, e] of local) {
    if (e.expires <= Date.now()) local.delete(key);
    else bytes += e.bytes;
  }
  while (bytes > LOCAL_BYTES || local.size > 4096) {
    const key = local.keys().next().value!;
    bytes -= local.get(key)!.bytes;
    local.delete(key);
  }
}
function remember(key: string, value: unknown, bytes: number, expires: number) {
  local.delete(key);
  // Never evict every other artifact merely to insert one unretainable basis.
  if (bytes <= LOCAL_BYTES)
    local.set(key, {
      value,
      bytes,
      expires: Math.min(expires, Date.now() + 900_000),
    });
  prune();
}

/** One eviction unit per logical artifact; only bounded chunks cross the Redis boundary. */
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
      id: `artifact:chunks-v1:${id}`,
    });
  const chunkKey = (id: string, generation: string, index: number) =>
    keyFor(`${id}:chunk:${generation}:${index}`);
  return {
    async read<T>(
      id: string,
      validate: (v: unknown) => v is T,
    ): Promise<T | undefined> {
      prune();
      const memory = local.get(memoryKey(id));
      if (memory && validate(memory.value)) return memory.value;
      if (!redis) return;
      let chunkCount = 0;
      let bytes = 0;
      try {
        checkResourceBudget();
        const started = Date.now();
        const [raw, ttl] = await Promise.all([
          redis.get(keyFor(id)),
          redis.pTTL(keyFor(id)),
        ]);
        if (!raw || !positiveInteger(ttl)) return;
        if (Buffer.byteLength(raw) > RETURN_ARTIFACT_CHUNK_BYTES)
          throw new Error(
            "Return artifact manifest exceeds its supported size.",
          );
        let manifest: unknown;
        try {
          manifest = JSON.parse(raw);
        } catch {
          throw new Error("Invalid return artifact manifest JSON.");
        }
        if (!validManifest(manifest))
          throw new Error("Invalid return artifact manifest.");
        chunkCount = manifest.chunks.length;
        const decoder = createReturnArtifactDecoder();
        let expires = Math.min(manifest.expires, started + ttl);
        for (let offset = 0; offset < chunkCount; offset += 4) {
          checkResourceBudget();
          const readAt = Date.now();
          const chunks = await Promise.all(
            manifest.chunks.slice(offset, offset + 4).map(async (chunk, i) => {
              const key = chunkKey(id, manifest.generation, offset + i);
              const [data, lifetime] = await Promise.all([
                redis.get(key),
                redis.pTTL(key),
              ]);
              if (
                !data ||
                !positiveInteger(lifetime) ||
                Buffer.byteLength(data) !== chunk.bytes ||
                hash(data) !== chunk.hash
              )
                throw new Error(
                  "Return artifact chunk is missing, expired, or corrupt.",
                );
              return { data, expires: readAt + lifetime };
            }),
          );
          for (const chunk of chunks) {
            decoder.append(chunk.data);
            bytes += Buffer.byteLength(chunk.data);
            expires = Math.min(expires, chunk.expires);
          }
        }
        checkResourceBudget();
        const value = decoder.finish();
        if (expires <= Date.now()) return;
        if (!validate(value))
          throw new Error("Invalid return artifact payload.");
        remember(memoryKey(id), value, bytes, expires);
        return value;
      } catch (error) {
        await warning(error, "read", id, chunkCount, bytes);
      }
    },
    async save<T>(id: string, value: T, validUntil: number) {
      const expires = Math.trunc(Math.min(validUntil, Date.now() + 86400_000));
      if (!Number.isFinite(expires) || expires <= Date.now()) return;
      const manifest: Manifest = {
        version: 1,
        generation: createId(),
        expires,
        bytes: 0,
        chunks: [],
      };
      let remote = !!redis;
      // Generations make chunks immutable even when concurrent writers publish the same ID.
      for (const raw of encodeReturnArtifact(value)) {
        checkResourceBudget();
        const index = manifest.chunks.length;
        const bytes = Buffer.byteLength(raw);
        manifest.chunks.push({ hash: hash(raw), bytes });
        manifest.bytes += bytes;
        if (Date.now() >= expires) return;
        if (remote && redis)
          try {
            await redis.set(chunkKey(id, manifest.generation, index), raw, {
              expiration: { type: "PXAT", value: expires },
            });
          } catch (error) {
            remote = false;
            await warning(error, "write chunk", id, index + 1, manifest.bytes);
          }
      }
      remember(memoryKey(id), value, manifest.bytes, expires);
      if (remote && redis)
        try {
          const raw = JSON.stringify(manifest);
          if (Buffer.byteLength(raw) > RETURN_ARTIFACT_CHUNK_BYTES)
            throw new Error(
              "Return artifact manifest exceeds its supported size.",
            );
          checkResourceBudget();
          // A failed or interrupted chunk write must never publish a partial snapshot.
          await redis.set(keyFor(id), raw, {
            expiration: { type: "PXAT", value: expires },
          });
        } catch (error) {
          await warning(
            error,
            "publish manifest",
            id,
            manifest.chunks.length,
            manifest.bytes,
          );
        }
    },
  };
}
