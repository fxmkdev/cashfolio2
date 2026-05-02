import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  getSkippedValuationWarning,
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
