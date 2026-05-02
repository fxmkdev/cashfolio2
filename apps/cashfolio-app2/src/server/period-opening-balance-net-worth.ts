import { createServerFn } from "@tanstack/react-start";
import { normalizePeriodValue } from "../shared/period";

export type OpeningBalanceNetWorthResult = {
  openingBalanceNetWorth: number;
  skippedCount: number;
  periodStart: string;
};

export const getOpeningBalanceNetWorthForPeriod = createServerFn({
  method: "GET",
})
  .inputValidator((data: { accountBookId: string; period?: unknown }) => ({
    accountBookId: data.accountBookId,
    period: normalizePeriodValue(data.period),
  }))
  .handler(async ({ data }): Promise<OpeningBalanceNetWorthResult> => {
    const [
      { ensureAuthorizedForAccountBookId },
      { loadOpeningBalanceNetWorthForPeriod },
    ] = await Promise.all([
      import("../account-books/functions.server"),
      import("./period-opening-balance-net-worth.server"),
    ]);

    await ensureAuthorizedForAccountBookId(data.accountBookId);

    return loadOpeningBalanceNetWorthForPeriod(data);
  });
