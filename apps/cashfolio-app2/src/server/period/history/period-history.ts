import { createServerFn } from "@tanstack/react-start";
import { getHistoryWindow } from "./history-window";
import { validateHistoryInput } from "./period-history-input";
import {
  checkResourceBudget,
  failResourceRequest,
  startReadBudget,
} from "../../resource-context.server";
import { prisma } from "../../../prisma.server";
import { ResourceLimitError } from "../../resource-error";
import { normalizeGainLossScope } from "../../../shared/history-scope";
import { buildHistoryBatchResponse } from "./period-history-batch-response";
import type {
  PeriodHistoryBatchResponse,
  PeriodHistoryGranularity,
} from "./period-history-types";

export type {
  PeriodHistoryBatchResponse,
  PeriodHistoryGranularity,
  PeriodHistoryPoint,
  PeriodHistoryOpeningBalancePoint,
  PeriodHistoryResponse,
} from "./period-history-types";

export function buildHistoryPeriodValues(args: {
  granularity: PeriodHistoryGranularity;
  minDate: Date;
  maxDate: Date;
}): string[] {
  return getHistoryWindow(args).values;
}

export const getPeriodHistory = createServerFn({ method: "GET" })
  .validator(validateHistoryInput)
  .handler(async ({ data }): Promise<PeriodHistoryBatchResponse> => {
    const { ensureAuthorizedForAccountBookId } =
      await import("../../../account-books/functions.server");
    const { loadPeriodHistoryPointContext } =
      await import("./period-history-point.server");
    const { getHistoryMetricScopeFilter, loadHistoryBatchPoints } =
      await import("./period-history-batch.server");
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    startReadBudget();
    const context = await loadPeriodHistoryPointContext({
      accountBookId: data.accountBookId,
    });
    data.gainLossScope = normalizeGainLossScope(
      data.gainLossScope,
      context.gainLossAccountScopes ?? [],
    );

    const activeMetricScopeFilter = getHistoryMetricScopeFilter(data);
    const window = getHistoryWindow({
      granularity: data.granularity,
      minDate: context.accountBookStartDate,
      maxDate: new Date(),
      before: data.before,
      pageSize: data.pageSize,
    });

    const loaded = await loadHistoryBatchPoints({
      data,
      context,
      periodValues: window.values,
      nextBefore: window.nextBefore,
      activeMetricScopeFilter,
    });
    const response = buildHistoryBatchResponse({
      data,
      context,
      ...loaded,
      nextBefore: window.nextBefore,
    });
    checkResourceBudget();
    if (context.revision) {
      const book = await prisma.accountBook.findUniqueOrThrow({
        where: { id: data.accountBookId },
        select: { periodCacheRevision: true },
      });
      if (book.periodCacheRevision !== context.revision)
        failResourceRequest(
          new ResourceLimitError(
            "This account book changed. Reload History and try again.",
            409,
            0,
            "history_revision_changed",
          ),
        );
    }

    return response;
  });
