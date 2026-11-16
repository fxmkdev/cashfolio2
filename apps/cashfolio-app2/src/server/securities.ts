import { createServerFn } from "@tanstack/react-start";
import { ensureUser } from "../users/functions.server";
import { prisma } from "../prisma.server";
import { startReadBudget } from "./resource-context.server";
import { readScope, readQuery, readSelection } from "./securities/input";
import {
  catalogueStatus,
  searchCatalogue,
  filterOptions,
} from "./securities/store.server";
import { securityHistory } from "./securities/history.server";

export const getSecuritiesCatalogue = createServerFn({ method: "GET" }).handler(
  async () => {
    await ensureUser();
    startReadBudget();
    return catalogueStatus(prisma);
  },
);
// Set-filter selections can exceed URL limits; this remains a read operation.
export const searchSecurities = createServerFn({ method: "POST" })
  .validator(readQuery)
  .handler(async ({ data }) => {
    await ensureUser();
    startReadBudget();
    return searchCatalogue(prisma, data);
  });
export const getSecuritiesFilterOptions = createServerFn({ method: "GET" })
  .validator(readScope)
  .handler(async ({ data }) => {
    await ensureUser();
    startReadBudget();
    return filterOptions(prisma, data);
  });
export const getSecurityHistory = createServerFn({ method: "GET" })
  .validator(readSelection)
  .handler(async ({ data }) => {
    await ensureUser();
    return securityHistory(prisma, data);
  });
