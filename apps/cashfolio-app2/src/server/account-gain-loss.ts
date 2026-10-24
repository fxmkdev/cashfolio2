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
      type: "ASSET" | "LIABILITY" | "BALANCE";
      accountState: "active" | "inactive" | "all";
    }) => {
      if (
        !["ASSET", "LIABILITY", "BALANCE"].includes(data.type) ||
        !["active", "inactive", "all"].includes(data.accountState)
      )
        throw new Error("Invalid account G/L scope");
      return data;
    },
  )
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
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
    return queryAccountGainLoss(data);
  });
