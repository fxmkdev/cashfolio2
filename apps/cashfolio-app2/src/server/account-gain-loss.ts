import {
  readAccountGainLossInput,
  readAccountGainLossScopeInput,
} from "./accounts/accounts-read-input";
import { startReadBudget } from "./resource-context.server";
import { createServerFn } from "@tanstack/react-start";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import {
  queryAccountGainLoss,
  queryAccountGainLossSummaries,
  queryAccountRecordedGainLossEligibility,
} from "./accounts/account-gain-loss.server";

export const getAccountRecordedGainLossEligibility = createServerFn({
  method: "GET",
})
  .validator(readAccountGainLossInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    startReadBudget();
    return queryAccountRecordedGainLossEligibility(data);
  });

export const getAccountGainLossSummaries = createServerFn({ method: "GET" })
  .validator(readAccountGainLossScopeInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    startReadBudget();
    return queryAccountGainLossSummaries(data);
  });

export const getAccountGainLoss = createServerFn({ method: "GET" })
  .validator(readAccountGainLossInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    startReadBudget();
    return queryAccountGainLoss(data);
  });
