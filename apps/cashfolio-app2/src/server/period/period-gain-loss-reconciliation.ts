import { createServerFn } from "@tanstack/react-start";
import { ensureAuthorizedForAccountBookId } from "../../account-books/functions.server";
import { prisma } from "../../prisma.server";
import { startOfUtcDay } from "../../shared/date";
import { normalizePeriodValue } from "../../shared/period";
import { buildRealAccountReconciliation } from "./period-gain-loss-reconciliation-real-account";
import { VIRTUAL_TRANSFER_CLEARING_ACCOUNT_PREFIX } from "./period-gain-loss-reconciliation-shared";
import { buildTransferClearingReconciliation } from "./period-gain-loss-reconciliation-transfer-clearing";
import type {
  GainLossReconciliationDiagnostic,
  PeriodGainLossReconciliation,
} from "./period-gain-loss-reconciliation-types";
import {
  getPeriodEndExclusive,
  resolvePeriodSelection,
} from "./period-selection";

function sortDiagnostics(
  diagnostics: GainLossReconciliationDiagnostic[],
): GainLossReconciliationDiagnostic[] {
  return diagnostics.sort(
    (left, right) =>
      left.date.localeCompare(right.date, "en") ||
      (left.bookingId ?? "").localeCompare(right.bookingId ?? "", "en"),
  );
}

export const getPeriodGainLossReconciliation = createServerFn({
  method: "GET",
})
  .inputValidator(
    (data: { accountBookId: string; accountId: string; period?: unknown }) => ({
      accountBookId: data.accountBookId,
      accountId: data.accountId,
      period: normalizePeriodValue(data.period),
    }),
  )
  .handler(async ({ data }): Promise<PeriodGainLossReconciliation | null> => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const accountBook = await prisma.accountBook.findUniqueOrThrow({
      where: { id: data.accountBookId },
      select: {
        referenceCurrency: true,
        startDate: true,
      },
    });

    const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
    const accountBookStartDate = startOfUtcDay(accountBook.startDate);
    const now = new Date();
    const selection = resolvePeriodSelection({
      periodValue: data.period,
      now,
      firstBookingDate: accountBookStartDate,
    });
    const isBeforeAccountBookStart = selection.to < accountBookStartDate;
    const queryStart = selection.from;
    const queryEndExclusive = getPeriodEndExclusive(selection.to);
    const initialHoldingDate = new Date(
      queryStart.getTime() - 24 * 60 * 60 * 1000,
    );

    const details = data.accountId.startsWith(
      VIRTUAL_TRANSFER_CLEARING_ACCOUNT_PREFIX,
    )
      ? await buildTransferClearingReconciliation({
          accountBookId: data.accountBookId,
          accountId: data.accountId,
          queryStart,
          queryEndExclusive,
          initialHoldingDate,
          periodEnd: selection.to,
          referenceCurrency,
          isBeforeAccountBookStart,
        })
      : await buildRealAccountReconciliation({
          accountBookId: data.accountBookId,
          accountId: data.accountId,
          queryStart,
          queryEndExclusive,
          initialHoldingDate,
          periodEnd: selection.to,
          referenceCurrency,
          isBeforeAccountBookStart,
        });

    if (!details) {
      return null;
    }

    return {
      target: details.target,
      referenceCurrency,
      selectedPeriodValue: selection.periodValue,
      selectedPeriodLabel: selection.label,
      selectedPeriodSpecifier: selection.periodSpecifier,
      selectedGranularity: selection.granularity,
      selectedYear: selection.year,
      selectedMonth: selection.month,
      periodBounds: {
        minBookingDate: accountBookStartDate.toISOString(),
        maxDate: startOfUtcDay(now).toISOString(),
      },
      periodDateRange: {
        from: selection.from.toISOString(),
        to: selection.to.toISOString(),
      },
      summary: details.summary,
      realizedEvents: details.realizedEvents,
      unrealizedOpenLots: details.unrealizedOpenLots,
      diagnostics: {
        skippedCount: details.skippedCount,
        items: sortDiagnostics(details.diagnostics),
      },
    };
  });

export type { PeriodGainLossReconciliation };
