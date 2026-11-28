import { vi } from "vitest";

/** Shared in-memory Redis boundary; independent module imports act as app instances. */
export function artifactRedis() {
  const entries = new Map<string, { value: string; expires: number }>();
  const redis = {
    get: vi.fn(async (key: string) => {
      const entry = entries.get(key);
      return entry && entry.expires > Date.now() ? entry.value : null;
    }),
    pTTL: vi.fn(async (key: string) => {
      const entry = entries.get(key);
      return entry ? Math.max(-2, entry.expires - Date.now()) : -2;
    }),
    set: vi.fn(
      async (
        key: string,
        value: string,
        options: { expiration: { type: string; value: number } },
      ) => {
        entries.set(key, { value, expires: options.expiration.value });
        return "OK";
      },
    ),
  };
  return { redis, entries };
}
