import { createHash } from "node:crypto";
import { getRedisClient } from "../../../redis.server";
import { getProviderApiKey } from "../provider-api-key.server";
import { rethrowResourceError } from "../../resource-error";
import type { ValuationProviderName } from "../provider-usage.server";
const local = new Map<string, { supported: boolean; expires: number }>();
export async function historyCapability(provider: ValuationProviderName) {
  const secret = await getProviderApiKey({
    envVarName: `${provider}_API_KEY`,
    missingKeyWarning: `${provider}_API_KEY is not set.`,
  });
  const key = `valuation:history-capability:v1:${provider}:${createHash(
    "sha256",
  )
    .update(secret ?? "unconfigured")
    .digest("hex")}`;
  const redis = await getRedisClient();
  let supported: boolean | undefined;
  const memory = local.get(key);
  if (memory && memory.expires > Date.now()) supported = memory.supported;
  else if (redis)
    try {
      const value = await redis.get(key);
      if (value === "yes" || value === "no") supported = value === "yes";
    } catch (e) {
      rethrowResourceError(e);
    }
  return {
    supported,
    async set(value: boolean) {
      local.set(key, {
        supported: value,
        expires: Date.now() + 24 * 60 * 60 * 1000,
      });
      if (local.size > 64) local.delete(local.keys().next().value!);
      if (redis)
        try {
          await redis.setEx(key, 86400, value ? "yes" : "no");
        } catch (e) {
          rethrowResourceError(e);
        }
    },
  };
}
