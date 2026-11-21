import { prisma } from "@/prisma.server";
import { ensureSameOriginRequestFromServerContext } from "@/security/same-origin.server";
import { restoreSecurity } from "./securities/restore.server";
import { createServerFn } from "@tanstack/react-start";
import { ensureUser } from "../users/functions.server";
import { startReadBudget } from "./resource-context.server";
import {
  readQuery,
  readSelection,
  readIdentity,
  readExchangePreference,
} from "./securities/input";
import {
  searchListings,
  exchangeDirectory,
} from "./securities/discovery.server";
import { securityHistory } from "./securities/history.server";
import { securityMetadata } from "./securities/metadata.server";

export const getSecuritiesExchanges = createServerFn({ method: "GET" }).handler(
  async () => {
    await ensureUser();
    startReadBudget();
    return exchangeDirectory();
  },
);
export const searchSecurities = createServerFn({ method: "GET" })
  .validator(readQuery)
  .handler(async ({ data }) => {
    await ensureUser();
    startReadBudget();
    return searchListings(data);
  });
export const getSecurityHistory = createServerFn({ method: "GET" })
  .validator(readSelection)
  .handler(async ({ data }) => {
    await ensureUser();
    return securityHistory(data);
  });

export const getSecurityMetadata = createServerFn({ method: "GET" })
  .validator(readSelection)
  .handler(async ({ data }) => {
    await ensureUser();
    return securityMetadata(data);
  });

export const resolveSecuritySelection = createServerFn({ method: "GET" })
  .validator(readIdentity)
  .handler(async ({ data }) => {
    await ensureUser();
    startReadBudget();
    return restoreSecurity(data);
  });

export const getSecuritiesPreference = createServerFn({
  method: "GET",
}).handler(async () => {
  const user = await ensureUser();
  return readExchangePreference({ exchange: user.securitiesExchangeMic });
});
export const updateSecuritiesPreference = createServerFn({ method: "POST" })
  .validator(readExchangePreference)
  .handler(async ({ data }) => {
    ensureSameOriginRequestFromServerContext();
    const user = await ensureUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { securitiesExchangeMic: data.exchange },
    });
    return data;
  });
