import { describe, expect, it } from "vitest";
import { toMoney } from "../../shared/money";
import { isAccountGainLossCacheData } from "./account-gain-loss-cache-data";

function createData() {
  return {
    referenceCurrency: "CHF",
    startDate: "2026-01-01T00:00:00.000Z",
    asOfDate: "2026-05-11T00:00:00.000Z",
    accounts: [
      {
        id: "a",
        type: "ASSET",
        isActive: true,
        groupId: null,
        result: {
          applicable: true,
          summary: {
            realizedGainLoss: toMoney("0.1"),
            unrealizedGainLoss: null,
            totalGainLoss: null,
          },
          diagnostics: [
            { date: "2026-05-11T00:00:00.000Z", message: "Unavailable" },
          ],
        },
      },
    ],
    groups: [{ id: "g", type: "EQUITY", parentGroupId: null }],
  };
}

describe("account G/L cache payload validation", () => {
  it("accepts finite Decimal values, null components, diagnostics, and empty books", () => {
    expect(isAccountGainLossCacheData(createData())).toBe(true);
    expect(
      isAccountGainLossCacheData({ ...createData(), accounts: [], groups: [] }),
    ).toBe(true);
  });
  it.each([
    null,
    { referenceCurrency: null },
    { startDate: "invalid" },
    { asOfDate: null },
    { accounts: null },
    { accounts: [null] },
    { accounts: [{ ...createData().accounts[0], id: null }] },
    { accounts: [{ ...createData().accounts[0], type: "EQUITY" }] },
    { accounts: [{ ...createData().accounts[0], isActive: null }] },
    { accounts: [{ ...createData().accounts[0], groupId: 1 }] },
    { accounts: [{ ...createData().accounts[0], result: null }] },
    {
      accounts: [
        { ...createData().accounts[0], result: { applicable: "yes" } },
      ],
    },
    {
      accounts: [
        {
          ...createData().accounts[0],
          result: { ...createData().accounts[0]!.result, summary: null },
        },
      ],
    },
    ...["realizedGainLoss", "unrealizedGainLoss", "totalGainLoss"].map(
      (field) => ({
        accounts: [
          {
            ...createData().accounts[0],
            result: {
              ...createData().accounts[0]!.result,
              summary: {
                ...createData().accounts[0]!.result.summary,
                [field]: 1,
              },
            },
          },
        ],
      }),
    ),
    {
      accounts: [
        {
          ...createData().accounts[0],
          result: { ...createData().accounts[0]!.result, diagnostics: null },
        },
      ],
    },
    ...[
      null,
      { date: "invalid", message: "x" },
      { date: "2026-01-01", message: null },
    ].map((diagnostic) => ({
      accounts: [
        {
          ...createData().accounts[0],
          result: {
            ...createData().accounts[0]!.result,
            diagnostics: [diagnostic],
          },
        },
      ],
    })),
    { groups: null },
    { groups: [null] },
    { groups: [{ ...createData().groups[0], id: null }] },
    { groups: [{ ...createData().groups[0], type: "INVALID" }] },
    { groups: [{ ...createData().groups[0], parentGroupId: 1 }] },
  ])("rejects malformed payload %#", (override) => {
    expect(
      isAccountGainLossCacheData(
        override === null ? null : { ...createData(), ...override },
      ),
    ).toBe(false);
  });
});
