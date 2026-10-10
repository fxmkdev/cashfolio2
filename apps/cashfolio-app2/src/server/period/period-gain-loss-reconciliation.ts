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
import { normalizeUserLocaleInput, type UserLocale } from "../../user-locale";

type PeriodGainLossReconciliationInput = {
  accountBookId: string;
  accountId: string;
  period?: unknown;
  locale?: unknown;
};

type ValidatedPeriodGainLossReconciliationInput = {
  accountBookId: string;
  accountId: string;
  period: string;
  locale: UserLocale;
};

type PeriodGainLossReconciliationPageData = {
  reportPeriodValue: string;
  reportPeriodLabel: string;
  reconciliation: PeriodGainLossReconciliation | null;
};

function validatePeriodGainLossReconciliationInput(
  data: PeriodGainLossReconciliationInput,
): ValidatedPeriodGainLossReconciliationInput {
  return {
    accountBookId: data.accountBookId,
    accountId: data.accountId,
    period: normalizePeriodValue(data.period),
    locale: normalizeUserLocaleInput(data.locale),
  };
}

function sortDiagnostics(
  diagnostics: GainLossReconciliationDiagnostic[],
): GainLossReconciliationDiagnostic[] {
  return diagnostics.sort(
    (left, right) =>
      left.date.localeCompare(right.date, "en") ||
      (left.bookingId ?? "").localeCompare(right.bookingId ?? "", "en"),
  );
}

async function loadPeriodGainLossReconciliationPageData(
  data: ValidatedPeriodGainLossReconciliationInput,
): Promise<PeriodGainLossReconciliationPageData> {
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
    locale: data.locale,
  });
  const reportPeriodValue = selection.periodValue;
  const reportPeriodLabel = selection.label;
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
    return {
      reportPeriodValue,
      reportPeriodLabel,
      reconciliation: null,
    };
  }

  return {
    reportPeriodValue,
    reportPeriodLabel,
    reconciliation: {
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
    },
  };
}

export const getPeriodGainLossReconciliation = createServerFn({
  method: "GET",
})
  .validator(validatePeriodGainLossReconciliationInput)
  .handler(async ({ data }): Promise<PeriodGainLossReconciliation | null> => {
    const pageData = await loadPeriodGainLossReconciliationPageData(data);
    return pageData.reconciliation;
  });

export const getPeriodGainLossReconciliationPageData = createServerFn({
  method: "GET",
})
  .validator(validatePeriodGainLossReconciliationInput)
  .handler(async ({ data }): Promise<PeriodGainLossReconciliationPageData> =>
    loadPeriodGainLossReconciliationPageData(data),
  );

export type { PeriodGainLossReconciliation };
