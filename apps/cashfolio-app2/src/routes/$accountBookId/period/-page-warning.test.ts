import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  getNetWorthReconciliationWarning,
  getSkippedValuationWarning,
  PeriodNetWorthReconciliationWarning,
  PeriodSkippedValuationWarning,
} from "./-page-warning";

describe("getSkippedValuationWarning", () => {
  it("returns warning text when valuation items were skipped", () => {
    expect(getSkippedValuationWarning(2)).toContain(
      "Strict total-return reconciliation versus net-worth deltas may be incomplete",
    );
  });

  it("returns null when no valuation items were skipped", () => {
    expect(getSkippedValuationWarning(0)).toBeNull();
  });
});

describe("getNetWorthReconciliationWarning", () => {
  const formatter = new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  it("returns warning text when reconciliation mismatches", () => {
    expect(
      getNetWorthReconciliationWarning({
        reconciliation: {
          hasMismatch: true,
          baselineSource: "previous-period",
          baselineNetWorth: 100,
          expectedNetWorth: 130,
          currentNetWorth: 130.01,
          difference: 0.01,
        },
        currencyFormatter: formatter,
      }),
    ).toContain("does not match expected end-of-period net worth");
  });

  it("returns null when there is no mismatch", () => {
    expect(
      getNetWorthReconciliationWarning({
        reconciliation: {
          hasMismatch: false,
          baselineSource: "opening-balance",
          baselineNetWorth: 0,
          expectedNetWorth: 0,
          currentNetWorth: 0,
          difference: 0,
        },
        currencyFormatter: formatter,
      }),
    ).toBeNull();
  });
});

describe("PeriodSkippedValuationWarning", () => {
  it("renders warning banner when skipped count is above zero", () => {
    const html = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(PeriodSkippedValuationWarning, {
          skippedBookingsCount: 1,
        }),
      ),
    );

    expect(html).toContain("period-skipped-valuations-warning");
    expect(html).toContain(
      "Strict total-return reconciliation versus net-worth deltas may be incomplete",
    );
  });

  it("renders nothing when skipped count is zero", () => {
    const html = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(PeriodSkippedValuationWarning, {
          skippedBookingsCount: 0,
        }),
      ),
    );

    expect(html).not.toContain("period-skipped-valuations-warning");
  });
});

describe("PeriodNetWorthReconciliationWarning", () => {
  const formatter = new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  it("renders warning banner when mismatch exists", () => {
    const html = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(PeriodNetWorthReconciliationWarning, {
          reconciliation: {
            hasMismatch: true,
            baselineSource: "opening-balance",
            baselineNetWorth: 0,
            expectedNetWorth: 130,
            currentNetWorth: 130.01,
            difference: 0.01,
          },
          currencyFormatter: formatter,
        }),
      ),
    );

    expect(html).toContain("period-net-worth-reconciliation-warning");
    expect(html).toContain("Net worth reconciliation mismatch");
  });

  it("renders nothing when mismatch is absent", () => {
    const html = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(PeriodNetWorthReconciliationWarning, {
          reconciliation: {
            hasMismatch: false,
            baselineSource: "previous-period",
            baselineNetWorth: 100,
            expectedNetWorth: 130,
            currentNetWorth: 130,
            difference: 0,
          },
          currencyFormatter: formatter,
        }),
      ),
    );

    expect(html).not.toContain("period-net-worth-reconciliation-warning");
  });
});
