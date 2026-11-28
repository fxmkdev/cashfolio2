import { createServerFn } from "@tanstack/react-start";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { startReadBudget } from "./resource-context.server";
import {
  readAccountReturnScope,
  readAccountReturnDetailsInput,
} from "./accounts/returns/return-read-input";
import { queryAccountReturnWork } from "./accounts/returns/account-returns.server";
import { withLoggedReturnRequest } from "./accounts/returns/return-request-logging.server";

export const getAccountReturnSummaries = createServerFn({ method: "GET" })
  .validator(readAccountReturnScope)
  .handler(async ({ data }) =>
    withLoggedReturnRequest("getAccountReturnSummaries", data, async () => {
      const link = await ensureAuthorizedForAccountBookId(data.accountBookId);
      startReadBudget();
      const result = await queryAccountReturnWork(data, link.userId);
      if (result.status !== "complete") return result;
      if (!("rows" in result.data))
        throw new Error("Invalid return summary response.");
      return { ...result, data: result.data };
    }),
  );

export const getAccountReturnDetails = createServerFn({ method: "GET" })
  .validator(readAccountReturnDetailsInput)
  .handler(async ({ data }) =>
    withLoggedReturnRequest("getAccountReturnDetails", data, async () => {
      const link = await ensureAuthorizedForAccountBookId(data.accountBookId);
      startReadBudget();
      const result = await queryAccountReturnWork(data, link.userId);
      if (result.status !== "complete") return result;
      if ("rows" in result.data)
        throw new Error("Invalid return detail response.");
      return { ...result, data: result.data };
    }),
  );
