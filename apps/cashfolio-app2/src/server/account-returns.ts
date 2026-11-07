import { createServerFn } from "@tanstack/react-start";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { startReadBudget } from "./resource-context.server";
import {
  readAccountReturnScope,
  readAccountReturnDetailsInput,
} from "./accounts/returns/return-read-input";
import {
  queryAccountReturnSummaries,
  queryAccountReturnDetails,
} from "./accounts/returns/account-returns.server";

export const getAccountReturnSummaries = createServerFn({ method: "GET" })
  .validator(readAccountReturnScope)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    startReadBudget();
    return queryAccountReturnSummaries(data);
  });

export const getAccountReturnDetails = createServerFn({ method: "GET" })
  .validator(readAccountReturnDetailsInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    startReadBudget();
    const result = await queryAccountReturnDetails(data);
    return data.includeDetails
      ? result
      : { ...result, valuations: [], cashFlows: [] };
  });
