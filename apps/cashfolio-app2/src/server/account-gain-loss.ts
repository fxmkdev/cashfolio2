import { startReadBudget } from "./resource-context.server";
import { createServerFn } from "@tanstack/react-start";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import {
  queryAccountGainLoss,
  queryAccountGainLossSummaries,
} from "./accounts/account-gain-loss.server";

export const getAccountGainLossSummaries = createServerFn({ method: "GET" })
  .validator(
    (data: {
      accountBookId: string;
      type: "BALANCE";
      accountState: "active" | "inactive" | "all";
    }) => {
      if (
        data.type !== "BALANCE" ||
        !["active", "inactive", "all"].includes(data.accountState)
      )
        throw new Error("Invalid account G/L scope");
      return data;
    },
  )
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    startReadBudget();
    return queryAccountGainLossSummaries(data);
  });

export const getAccountGainLoss = createServerFn({ method: "GET" })
  .validator(
    (data: {
      accountBookId: string;
      accountId: string;
      period?: string;
      includeDetails?: boolean;
    }) => data,
  )
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    startReadBudget();
    return queryAccountGainLoss(data);
  });
