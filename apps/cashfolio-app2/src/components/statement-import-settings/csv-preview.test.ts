import { describe, expect, test } from "vitest";
import {
  createParsedPreview,
  getSampleMappingErrors,
  parseSample,
} from "./csv-preview";
import {
  debitCreditFormat,
  foreignCurrencyFormat,
  headerlessFormat,
  signedFormat,
} from "./fixtures";
import { SAMPLE_EXAMPLES } from "./examples";
import type { StatementImportCsvFormat } from "@/shared/statement-import-csv-format";

function preview(
  text: string,
  format: StatementImportCsvFormat = signedFormat,
) {
  return createParsedPreview(
    parseSample(text, format.hasHeader, format.delimitersToGuess),
    format,
  );
}

describe("sample CSV preview", () => {
  test("parses quoted delimiters, preserves source row numbers and caps the preview", () => {
    const sample = parseSample(
      'Date,Amount,Payee\n2026-11-01,-1,"Cafe, Zurich"\n' +
        Array.from({ length: 25 }, () => "2026-11-02,2,Shop").join("\n"),
      true,
      [",", ";"],
    );
    expect(sample.headers).toEqual(["Date", "Amount", "Payee"]);
    expect(sample.rows).toHaveLength(20);
    expect(sample.rows[0]).toMatchObject({
      sourceRow: 2,
      values: ["2026-11-01", "-1", "Cafe, Zurich"],
    });
    expect(sample.truncated).toBe(true);
  });

  test("parses signed, headerless and foreign-currency examples", () => {
    expect(preview(SAMPLE_EXAMPLES.signed.text)[0]).toMatchObject({
      date: "2026-11-01",
      amount: "-42.5",
      description: "Corner Market · Groceries",
      errors: "",
    });
    expect(
      preview(SAMPLE_EXAMPLES.headerless.text, headerlessFormat)[0],
    ).toMatchObject({ sourceRow: 1, amount: "-42.5", errors: "" });
    expect(
      preview(SAMPLE_EXAMPLES.signed.text, foreignCurrencyFormat)[2],
    ).toMatchObject({
      originalAmount: "-20",
      originalCurrency: "EUR",
      exchangeRate: "0.9375",
      errors: "",
    });
  });

  test("normalizes each supported date format and rejects calendar overflow", () => {
    const european = preview(
      SAMPLE_EXAMPLES.debitCredit.text,
      debitCreditFormat,
    );
    expect(european[0]).toMatchObject({
      date: "2026-11-01",
      amount: "2500",
      errors: "",
    });
    const american = preview("Date,Amount,Payee,Details\n11/07/2026,1,A,B", {
      ...signedFormat,
      dateFormat: "MM/dd/yyyy",
    });
    expect(american[0].date).toBe("2026-11-07");
    const invalid = preview(SAMPLE_EXAMPLES.invalid.text);
    expect(invalid[0].errors).toContain("Date:");
    expect(invalid[1].errors).toContain("Amount:");
  });

  test("inverts amounts without floating-point precision loss", () => {
    const format: StatementImportCsvFormat = {
      ...signedFormat,
      mappings: {
        date: 0,
        amount: { mode: "signed", column: 1, invertSign: true },
      },
    };
    expect(
      preview(
        "Date,Amount\n2026-11-01,12345678901234567890.123456789",
        format,
      )[0].amount,
    ).toBe("-12345678901234567890.123456789");
    expect(preview("Date,Amount\n2026-11-01,-0.10", format)[0].amount).toBe(
      "0.1",
    );
  });

  test("handles decimal commas and every supported thousands separator", () => {
    for (const separator of [".", "'", " ", ","] as const) {
      const format: StatementImportCsvFormat = {
        ...signedFormat,
        delimitersToGuess: [";"],
        numberFormat: {
          decimalSeparator: separator === "," ? "." : ",",
          thousandsSeparator: separator,
        },
        mappings: { date: 0, amount: { mode: "signed", column: 1 } },
      };
      const decimal = format.numberFormat!.decimalSeparator;
      expect(
        preview(
          `Date;Amount\n2026-11-01;1${separator}234${decimal}56`,
          format,
        )[0].amount,
      ).toBe("1234.56");
    }
  });

  test("validates debit/credit rows and allows one-sided mappings", () => {
    const rows = preview(
      "Date;Debit;Credit;Payee;Details\n01.11.2026;;42,50;Cafe;Lunch\n02.11.2026;1;2;A;B\n03.11.2026;0;;A;B\n04.11.2026;-3;;A;B",
      debitCreditFormat,
    );
    expect(rows[0].amount).toBe("-42.5");
    expect(rows[1].errors).toContain("cannot both");
    expect(rows[2].errors).toContain("required");
    expect(rows[3].amount).toBe("3");
    const creditOnly: StatementImportCsvFormat = {
      ...debitCreditFormat,
      mappings: { date: 0, amount: { mode: "debit-credit", creditColumn: 2 } },
    };
    expect(
      preview("Date;Debit;Credit\n01.11.2026;;42,50", creditOnly)[0].amount,
    ).toBe("-42.5");
  });

  test("flags missing, ambiguous and ragged columns without losing valid rows", () => {
    const ambiguous = parseSample(
      "Date,Date,Amount\n2026-11-01,2026-11-02,2",
      true,
      [","],
    );
    expect(getSampleMappingErrors(ambiguous, signedFormat).join(" ")).toContain(
      "ambiguous",
    );
    const missing = parseSample("Other,Amount\n2026-11-01,2", true, [","]);
    expect(getSampleMappingErrors(missing, signedFormat).join(" ")).toContain(
      "missing",
    );
    const ragged = parseSample("Date,Amount,Payee,Details\n2026-11-01", true, [
      ",",
    ]);
    expect(createParsedPreview(ragged, signedFormat)[0].errors).toContain(
      "missing from this row",
    );
  });

  test("reports empty, header-only, malformed and unparseable samples", () => {
    expect(parseSample("", true, [","]).errors).not.toHaveLength(0);
    expect(parseSample("Date,Amount", true, [","]).errors).toContain(
      "The sample contains no data rows.",
    );
    expect(
      parseSample('Date,Amount\n"broken', true, [","]).errors.join(" "),
    ).toContain("Quoted field unterminated");
    expect(parseSample("a,b", true, []).rows).toEqual([]);
    expect(parseSample("a,b", true, ["\n"]).errors).not.toHaveLength(0);
  });

  test("reports zero amounts, incomplete foreign-currency pairs and extra cells", () => {
    const rows = preview(
      "Date,Amount,Payee,Details,Original Amount,Original Currency,Exchange Rate\n2026-11-01,0,A,B,,,\n2026-11-02,1,A,B,2,,\n2026-11-03,1,A,B,,EUR,\n2026-11-04,1,A,B,2,eur,\n2026-11-05,1,A,B,0,EUR,\n2026-11-06,1,A,B,,,extra,cell",
      foreignCurrencyFormat,
    );
    expect(rows[0].errors).toContain("Amount must be non-zero");
    expect(rows[1].errors).toContain("Original currency: Required");
    expect(rows[2].errors).toContain("Original amount: Required");
    expect(rows[3].errors).toContain("uppercase");
    expect(rows[4].errors).toContain("Original amount must be non-zero");
    expect(rows[5].errors).toContain("more columns");
  });

  test("uses the importer's default separator for existing combined descriptions", () => {
    const rows = preview(SAMPLE_EXAMPLES.signed.text, {
      ...signedFormat,
      mappings: {
        ...signedFormat.mappings!,
        description: { columns: [2, 3] },
      },
    });
    expect(rows[0].description).toBe("Corner Market - Groceries");
  });
});
