import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { toMoney } from "../../../shared/money";
import type { AccountReturnResult } from "../../../shared/accounts/account-returns";
import {
  stagingReturnInputs,
  stagingReturnRate,
} from "./return-staging-test-support";
import {
  createReturnEngine,
  returnTargets,
  capitalRateRequests,
  returnRateKey,
  rateInput,
} from "./return-engine.server";
import { scopeInputs } from "./return-plan.server";

// Captured from 74f5b4b8c with these same staging inputs and prices before the
// simplification. Keep this independent reference when changing calculations.
const baseline = JSON.parse(
  readFileSync(
    new URL("./fixtures/money-weighted-baseline.json", import.meta.url),
    "utf8",
  ),
);

it("preserves pre-simplification MWR, dates, diagnostics and membership with no extra valuation requests", async () => {
  const inputs = stagingReturnInputs();
  const scopes = new Map<string, AccountReturnResult>();
  const requests = new Set<string>();
  for (const grouping of ["accountStructure", "assetClass"] as const) {
    const rows = [];
    for (const target of returnTargets(inputs, {
      accountBookId: "baseline",
      accountState: "all",
      grouping,
    })) {
      const key = [...target.accountIds].sort().join(",");
      let value = scopes.get(key);
      if (!value) {
        const subset = scopeInputs(inputs, target.accountIds);
        const engine = await createReturnEngine(subset, async (input) =>
          stagingReturnRate(input),
        );
        const data = await engine.calculate(target);
        expect(data.valuations).toEqual([]);
        expect(data.cashFlows).toEqual([]);
        expect(data).not.toHaveProperty("twr");
        expect(data).not.toHaveProperty("annualizedTwr");
        value = {
          applicable: data.applicable,
          mwr: data.mwr,
          annualizedMwr: data.annualizedMwr,
          effectiveStartDate: data.effectiveStartDate,
          effectiveEndDate: data.effectiveEndDate,
          diagnostics: data.diagnostics,
        };
        scopes.set(key, value);
        for (const request of capitalRateRequests(subset))
          requests.add(returnRateKey(rateInput(request)));
        const draft = await engine.calculate(
          target,
          async (input) => {
            if (!(
              input.unit === "CURRENCY" &&
              input.currency?.toUpperCase() === inputs.referenceCurrency
            ))
              requests.add(returnRateKey(input));
            return toMoney(1);
          },
          { valuationOnly: true, includeDetails: true },
        );
        expect(draft.valuations).toEqual([]);
        expect(draft.cashFlows).toEqual([]);
      }
      rows.push({ id: target.id, ...value });
    }
    expect(rows).toEqual(baseline[grouping]);
  }
  expect(requests.size).toBeLessThanOrEqual(baseline.requestCount);
  const ledgerInputs = stagingReturnInputs(
    new Date("2026-06-30Z"),
    "managed-portfolio",
  );
  const engine = await createReturnEngine(ledgerInputs, async (input) =>
    stagingReturnRate(input),
  );
  const target = returnTargets(
    ledgerInputs,
    {
      accountBookId: "baseline",
      accountState: "all",
      grouping: "accountStructure",
    },
    { kind: "account", id: "managed-portfolio" },
  )[0]!;
  const ledger = await engine.calculate(target, undefined, {
    includeDetails: true,
  });
  expect({
    mwr: ledger.mwr,
    annualizedMwr: ledger.annualizedMwr,
    effectiveStartDate: ledger.effectiveStartDate,
    effectiveEndDate: ledger.effectiveEndDate,
    cashFlows: ledger.cashFlows,
  }).toEqual(baseline.ledger);
  expect(new Set(ledger.valuations.map((v) => v.date)).size).toBe(
    ledger.valuations.length,
  );
  expect(ledger.valuations[0]?.kind).toBe("opening");
  expect(ledger.valuations.at(-1)?.kind).toBe("closing");
}, 30000);
