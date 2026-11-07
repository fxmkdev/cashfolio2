import { describe, expect, test } from "vitest";
import {
  columnChoice,
  createSettingsDraft,
  validateSettings,
} from "./form-state";
import {
  debitCreditFormat,
  foreignCurrencyFormat,
  orderedFormat,
  signedFormat,
} from "./fixtures";

describe("statement import settings draft", () => {
  test("creates an unconfigured disabled draft with the selected defaults", () => {
    const draft = createSettingsDraft(null);
    expect(draft).toMatchObject({
      enabled: false,
      hasHeader: true,
      delimiters: [",", ";"],
      dateFormat: "yyyy-MM-dd",
      numberFormat: { decimalSeparator: "." },
      amountMode: "signed",
      descriptions: [],
    });
    expect(validateSettings(draft)).toEqual({
      format: null,
      fieldErrors: {},
      errors: [],
    });
    expect(validateSettings({ ...draft, enabled: true }).fieldErrors).toEqual({
      date: "Choose a column.",
      amount: "Choose a column.",
    });
  });

  test("converts ordered columns into equivalent explicit zero-based mappings", () => {
    const draft = createSettingsDraft(orderedFormat);
    expect(draft.date).toEqual({ kind: "position", value: "1" });
    const result = validateSettings(draft);
    expect(result.errors).toEqual([]);
    expect(result.format?.columns).toBeUndefined();
    expect(result.format?.mappings).toMatchObject({
      date: { index: 0 },
      amount: { mode: "signed", column: { index: 1 } },
      originalAmount: { index: 2 },
      originalCurrency: { index: 3 },
      exchangeRate: { index: 4 },
      description: { columns: [{ index: 5 }], separator: " " },
    });
  });

  test.each([signedFormat, debitCreditFormat, foreignCurrencyFormat])(
    "round trips mappings and format options",
    (format) => {
      expect(validateSettings(createSettingsDraft(format)).format).toEqual({
        ...format,
        mappings: {
          ...format.mappings,
          ...(format.mappings?.amount.mode === "signed"
            ? { amount: { ...format.mappings.amount, invertSign: false } }
            : {}),
        },
      });
    },
  );

  test("supports numeric and object index references and a single description", () => {
    const draft = createSettingsDraft({
      ...signedFormat,
      mappings: {
        date: 0,
        amount: { mode: "signed", column: { index: 1 }, invertSign: true },
        description: { header: "Payee" },
      },
    });
    expect(draft.date).toEqual(columnChoice({ index: 0 }));
    expect(draft.invertSign).toBe(true);
    expect(draft.descriptions[0].column.value).toBe("Payee");
  });

  test("preserves description order and an explicitly empty separator", () => {
    const draft = createSettingsDraft(signedFormat);
    draft.descriptions.reverse();
    draft.separator = "";
    expect(validateSettings(draft).format?.mappings?.description).toEqual({
      columns: [{ header: "Details" }, { header: "Payee" }],
      separator: "",
    });
  });

  test("preserves the implicit separator of an existing combined description", () => {
    const draft = createSettingsDraft({
      ...signedFormat,
      mappings: {
        ...signedFormat.mappings!,
        description: { columns: [0, 1] },
      },
    });
    expect(draft.separator).toBe(" - ");
    expect(validateSettings(draft).format?.mappings?.description).toEqual({
      columns: [{ index: 0 }, { index: 1 }],
      separator: " - ",
    });
    expect(createSettingsDraft(null).separator).toBe(" ");
  });

  test("allows debit-only and credit-only configurations", () => {
    for (const field of ["debit", "credit"] as const) {
      const draft = createSettingsDraft(debitCreditFormat);
      draft[field].value = "";
      expect(validateSettings(draft).format).not.toBeNull();
    }
    const draft = createSettingsDraft(debitCreditFormat);
    draft.debit.value = draft.credit.value = "";
    expect(validateSettings(draft).fieldErrors.debit).toBeDefined();
  });

  test.each(["0", "-1", "1.5", "abc", "9007199254740992"])(
    "rejects invalid position %s",
    (value) => {
      const draft = createSettingsDraft(signedFormat);
      draft.date = { kind: "position", value };
      expect(validateSettings(draft).fieldErrors.date).toBeDefined();
    },
  );

  test("rejects headers without a header row, blank descriptions, invalid delimiters and conflicting separators", () => {
    const draft = createSettingsDraft(signedFormat);
    draft.hasHeader = false;
    draft.descriptions[0].column.value = "";
    draft.delimiters = [];
    draft.numberFormat.thousandsSeparator = ".";
    const result = validateSettings(draft);
    expect(result.format).toBeNull();
    expect(result.fieldErrors.date).toContain("header row");
    expect(result.fieldErrors[draft.descriptions[0].id]).toBeDefined();
    expect(result.errors).toHaveLength(2);
    draft.enabled = false;
    expect(validateSettings(draft)).toEqual({
      format: null,
      fieldErrors: {},
      errors: [],
    });
  });
});
