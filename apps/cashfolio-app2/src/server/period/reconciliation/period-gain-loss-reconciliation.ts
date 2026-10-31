import { startReadBudget } from "../../resource-context.server";
import type { Money } from "../../../shared/money";
import { getOrLoadPeriodBaseData } from "../cache/period-base-data-cache";
import { loadAccountGainLossSources } from "./period-account-gain-loss-sources";
import { toNumericMoney } from "../../money-boundary";
import { formatUnitLabel } from "../period-unit-format";
import { Unit } from "../../../.prisma-client/enums";
import { createServerFn } from "@tanstack/react-start";
import { ensureAuthorizedForAccountBookId } from "../../../account-books/functions.server";
import { startOfUtcDay } from "../../../shared/date";
import {
  formatMonthPeriodLabel,
  normalizePeriodValue,
} from "../../../shared/period";
import { buildRealAccountReconciliation } from "./period-gain-loss-reconciliation-real-account";
import { VIRTUAL_TRANSFER_CLEARING_ACCOUNT_PREFIX } from "./period-gain-loss-reconciliation-shared";
import { buildTransferClearingReconciliation } from "./period-gain-loss-reconciliation-transfer-clearing";
import type {
  GainLossReconciliationDiagnostic,
  PeriodGainLossReconciliation,
} from "../../../shared/gain-loss-reconciliation";
import {
  normalizeUserLocaleInput,
  type UserLocale,
} from "../../../user-locale";

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
  startReadBudget();

  const baseData = await getOrLoadPeriodBaseData({
    accountBookId: data.accountBookId,
    period: data.period,
  });
  const { selection, referenceCurrency } = baseData;
  const accountBookStartDate = selection.minPeriodDate;
  const now = new Date();
  const reportPeriodValue = selection.periodValue;
  const reportPeriodLabel =
    selection.granularity === "month"
      ? formatMonthPeriodLabel(
          selection.year,
          selection.month ?? 0,
          data.locale,
        )
      : String(selection.year);
  const exchangeRateByKey = new Map<string, Promise<Money | null>>();
  const sourceDetails = await loadAccountGainLossSources(
    baseData,
    data.accountId,
    exchangeRateByKey,
  );
  const realAccount = baseData.baseAssetLiabilityAccounts.find(
    (account) => account.id === data.accountId,
  );
  let details = data.accountId.startsWith(
    VIRTUAL_TRANSFER_CLEARING_ACCOUNT_PREFIX,
  )
    ? await buildTransferClearingReconciliation({
        baseData,
        accountId: data.accountId,
        exchangeRateByKey,
      })
    : await buildRealAccountReconciliation({
        baseData,
        accountId: data.accountId,
        exchangeRateByKey,
      });

  const node = sourceDetails.node;
  if (!details && (node || realAccount)) {
    const identity = realAccount?.unit
      ? realAccount
      : sourceDetails.contribution;
    if (identity) {
      const unitIdentity = {
        ...identity,
        unit: identity.unit ?? Unit.CURRENCY,
      };
      details = {
        target: {
          unit: unitIdentity.unit,
          currency: unitIdentity.currency,
          cryptocurrency: unitIdentity.cryptocurrency,
          symbol: unitIdentity.symbol,
          tradeCurrency: unitIdentity.tradeCurrency,
          accountId: data.accountId,
          accountName: node?.label ?? realAccount!.name,
          isVirtual: node?.account?.kind !== "account" && !realAccount,
          unitLabel: formatUnitLabel(unitIdentity),
        },
        summary: {
          realizedGainLoss: 0,
          unrealizedGainLoss: 0,
          totalGainLoss: 0,
        },
        realizedEvents: [],
        unrealizedOpenLots: [],
        diagnostics: [],
        skippedCount: 0,
      };
    }
  }
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
      selectedPeriodLabel: reportPeriodLabel,
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
      summary: node
        ? toNumericMoney({
            realizedGainLoss: node.realizedGainLoss,
            unrealizedGainLoss: node.unrealizedGainLoss,
            totalGainLoss: node.totalGainLoss,
          })
        : details.summary,
      sources: toNumericMoney({
        calculatedRealizedGainLoss:
          node?.account?.calculatedRealizedGainLoss ??
          details.summary.realizedGainLoss,
        recordedGainLoss: node?.account?.recordedGainLoss ?? 0,
        attributionExplanation: node?.account?.explanation ?? null,
        recordedAdjustments: sourceDetails.recordedAdjustments,
        executionResiduals: sourceDetails.executionResiduals,
      }),
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
