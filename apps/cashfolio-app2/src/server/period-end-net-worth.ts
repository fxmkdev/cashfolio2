import { createServerFn } from "@tanstack/react-start";
import { normalizePeriodValue } from "../shared/period";
import { type PeriodEndNetWorthResult } from "./period-end-net-worth.types";

export const getPeriodEndNetWorth = createServerFn({
  method: "GET",
})
  .inputValidator((data: { accountBookId: string; period?: unknown }) => ({
    accountBookId: data.accountBookId,
    period: normalizePeriodValue(data.period),
  }))
  .handler(async ({ data }): Promise<PeriodEndNetWorthResult> => {
    const [{ ensureAuthorizedForAccountBookId }, { loadPeriodEndNetWorth }] =
      await Promise.all([
        import("../account-books/functions.server"),
        import("./period-end-net-worth.server"),
      ]);

    await ensureAuthorizedForAccountBookId(data.accountBookId);

    return loadPeriodEndNetWorth(data);
  });
