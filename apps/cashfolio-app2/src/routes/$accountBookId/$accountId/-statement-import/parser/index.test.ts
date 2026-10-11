import { describe, expect, test } from "vitest";
import { Unit } from "@/.prisma-client/enums";
import {
  parseStatementImportCsv,
  type StatementImportCsvFormat,
} from "../index";
import { currentAccount } from "../test-fixtures";

const legacyCsvFormat = {
  hasHeader: true,
  delimitersToGuess: [",", ";"],
  columns: [
    "date",
    "amount",
    "original amount",
    "original currency",
    "exchange rate",
    "description",
  ],
  dateFormat: "yyyy-MM-dd",
  numberFormat: {
    decimalSeparator: ".",
  },
} as const satisfies StatementImportCsvFormat;

function parseWithLegacyFormat(
  args: Omit<Parameters<typeof parseStatementImportCsv>[0], "format"> & {
    format?: StatementImportCsvFormat;
  },
) {
  return parseStatementImportCsv({
    format: legacyCsvFormat,
    ...args,
  });
}

describe("statement import CSV parser", () => {
  test("parses strict CSV with quoted descriptions", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      text: [
        "date,amount,original amount,original currency,exchange rate,description",
        '2026-02-03,100.25,92.50,EUR,1.083784,"Transfer, incoming"',
      ].join("\n"),
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]).toMatchObject({
      ignored: false,
      date: "2026-02-03T00:00:00.000Z",
      amount: 100.25,
      originalAmount: 92.5,
      originalCurrency: "EUR",
      counterAccountId: "",
      description: "Transfer, incoming",
      transaction: {
        description: "Transfer, incoming",
        bookings: [
          {
            accountId: "asset-1",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 100.25,
          },
          {
            accountId: "",
            unit: Unit.CURRENCY,
            currency: "EUR",
            value: -92.5,
          },
        ],
      },
    });
  });

  test("parses semicolon-delimited CSV with quoted descriptions", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      text: [
        "Booking Date;Booked Amount;Source Amount;Source Currency;FX Rate;Memo",
        '2026-02-03;100.25;92.50;EUR;1.083784;"Transfer; incoming"',
      ].join("\n"),
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]).toMatchObject({
      amount: 100.25,
      originalAmount: 92.5,
      originalCurrency: "EUR",
      description: "Transfer; incoming",
    });
  });

  test("parses arbitrary header names by column order", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      text: [
        "Booked On,Value,Foreign Value,Foreign Ccy,Rate,Text",
        "2026-02-03,100.25,92.50,EUR,1.083784,Transfer",
      ].join("\n"),
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      date: "2026-02-03T00:00:00.000Z",
      amount: 100.25,
      originalAmount: 92.5,
      originalCurrency: "EUR",
      description: "Transfer",
    });
  });

  test("parses the legacy CSV format explicitly", () => {
    const text = [
      "date,amount,original amount,original currency,exchange rate,description",
      "2026-02-03,100.25,92.50,EUR,1.083784,Transfer",
    ].join("\n");

    const result = parseWithLegacyFormat({
      currentAccount,
      text,
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      date: "2026-02-03T00:00:00.000Z",
      amount: 100.25,
      originalAmount: 92.5,
      originalCurrency: "EUR",
      description: "Transfer",
    });
  });

  test("maps reordered columns by trimmed case-insensitive header names", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: true,
        delimitersToGuess: [","],
        mappings: {
          date: { header: "booking date" },
          amount: { mode: "signed", column: { header: "value" } },
          originalAmount: { header: "foreign value" },
          originalCurrency: { header: "foreign ccy" },
          description: { header: "memo" },
        },
      },
      text: [
        " Memo , Foreign Ccy , VALUE , Booking Date , Foreign Value ",
        "Transfer,EUR,100.25,2026-02-03,92.50",
      ].join("\n"),
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      sourceRowNumber: 2,
      date: "2026-02-03T00:00:00.000Z",
      amount: 100.25,
      originalAmount: 92.5,
      originalCurrency: "EUR",
      description: "Transfer",
    });
  });

  test("maps headerless CSVs by zero-based indexes", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: false,
        delimitersToGuess: [";"],
        mappings: {
          date: 0,
          amount: { mode: "signed", column: 2 },
          description: 1,
        },
      },
      text: "2026-02-03;Transfer;100.25",
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      sourceRowNumber: 1,
      amount: 100.25,
      description: "Transfer",
    });
  });

  test("allows ordered formats to omit optional columns", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: true,
        delimitersToGuess: [","],
        columns: ["date", "amount", "description"],
      },
      text: ["date,amount,description", "2026-02-03,100.25,Transfer"].join(
        "\n",
      ),
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      amount: 100.25,
      originalAmount: undefined,
      originalCurrency: undefined,
      description: "Transfer",
      transaction: {
        bookings: [
          {
            accountId: "asset-1",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 100.25,
          },
          {
            accountId: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -100.25,
          },
        ],
      },
    });
  });

  test("normalizes ordered formats with configured date and number formats", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: true,
        delimitersToGuess: [";"],
        columns: ["date", "amount", "description"],
        dateFormat: "dd.MM.yyyy",
        numberFormat: {
          decimalSeparator: ",",
          thousandsSeparator: "'",
        },
      },
      text: ["date;amount;description", "03.02.2026;1'234,50;Transfer"].join(
        "\n",
      ),
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      date: "2026-02-03T00:00:00.000Z",
      amount: 1234.5,
      description: "Transfer",
    });
  });

  test("parses configured date formats", () => {
    const european = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: true,
        delimitersToGuess: [";"],
        dateFormat: "dd.MM.yyyy",
        mappings: {
          date: { header: "Date" },
          amount: { mode: "signed", column: { header: "Amount" } },
          description: { header: "Description" },
        },
      },
      text: ["Date;Amount;Description", "03.02.2026;100.25;Transfer"].join(
        "\n",
      ),
    });
    const us = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: true,
        delimitersToGuess: [","],
        dateFormat: "MM/dd/yyyy",
        mappings: {
          date: { header: "Date" },
          amount: { mode: "signed", column: { header: "Amount" } },
          description: { header: "Description" },
        },
      },
      text: ["Date,Amount,Description", "02/03/2026,100.25,Transfer"].join(
        "\n",
      ),
    });

    expect(european.errors).toEqual([]);
    expect(us.errors).toEqual([]);
    expect(european.drafts[0]?.date).toBe("2026-02-03T00:00:00.000Z");
    expect(us.drafts[0]?.date).toBe("2026-02-03T00:00:00.000Z");
  });

  test("parses decimal commas with thousands separators", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: true,
        delimitersToGuess: [";"],
        numberFormat: {
          decimalSeparator: ",",
          thousandsSeparator: "'",
        },
        mappings: {
          date: { header: "Date" },
          amount: { mode: "signed", column: { header: "Amount" } },
          originalAmount: { header: "Original Amount" },
          originalCurrency: { header: "Currency" },
          description: { header: "Description" },
        },
      },
      text: [
        "Date;Amount;Original Amount;Currency;Description",
        "2026-02-03;1'234,50;1'000,10;EUR;Transfer",
      ].join("\n"),
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      amount: 1234.5,
      originalAmount: 1000.1,
      originalCurrency: "EUR",
    });
  });

  test("rejects identical decimal and thousands separators", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: true,
        delimitersToGuess: [";"],
        numberFormat: {
          decimalSeparator: ",",
          thousandsSeparator: ",",
        },
        mappings: {
          date: { header: "Date" },
          amount: { mode: "signed", column: { header: "Amount" } },
          description: { header: "Description" },
        },
      },
      text: ["Date;Amount;Description", "2026-02-03;1,23;Transfer"].join("\n"),
    });

    expect(result.drafts).toEqual([]);
    expect(result.errors).toContain(
      "CSV format decimal and thousands separators must be different.",
    );
  });

  test("derives signed amounts from debit and credit columns", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: true,
        delimitersToGuess: [","],
        mappings: {
          date: { header: "Date" },
          amount: {
            mode: "debit-credit",
            debitColumn: { header: "Debit" },
            creditColumn: { header: "Credit" },
          },
          description: { header: "Description" },
        },
      },
      text: [
        "Date,Debit,Credit,Description",
        "2026-02-03,100.25,,Incoming",
        "2026-02-04,,45.10,Outgoing",
      ].join("\n"),
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      amount: 100.25,
      description: "Incoming",
    });
    expect(result.drafts[1]).toMatchObject({
      amount: -45.1,
      description: "Outgoing",
    });
  });

  test("inverts signed statement amounts when configured", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: true,
        delimitersToGuess: [","],
        mappings: {
          date: { header: "Date" },
          amount: {
            mode: "signed",
            column: { header: "Amount" },
            invertSign: true,
          },
          description: { header: "Description" },
        },
      },
      text: ["Date,Amount,Description", "2026-02-03,-45.10,Payment"].join("\n"),
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      amount: 45.1,
      description: "Payment",
    });
  });

  test("preserves tiny normalized decimal amounts in flexible formats", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: true,
        delimitersToGuess: [","],
        mappings: {
          date: { header: "Date" },
          amount: { mode: "signed", column: { header: "Amount" } },
          description: { header: "Description" },
        },
      },
      text: [
        "Date,Amount,Description",
        "2026-02-03,0.00000001,Tiny income",
      ].join("\n"),
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      amount: 0.00000001,
      description: "Tiny income",
    });
  });

  test("joins multi-column descriptions and skips blank parts", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: true,
        delimitersToGuess: [","],
        mappings: {
          date: { header: "Date" },
          amount: { mode: "signed", column: { header: "Amount" } },
          description: {
            columns: [
              { header: "Merchant" },
              { header: "Reference" },
              { header: "Category" },
            ],
          },
        },
      },
      text: [
        "Date,Amount,Merchant,Reference,Category",
        "2026-02-03,100.25,Shop,,Groceries",
      ].join("\n"),
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      description: "Shop - Groceries",
    });
  });

  test("reports missing mapped columns and malformed values", () => {
    const missingHeader = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: true,
        delimitersToGuess: [","],
        mappings: {
          date: { header: "Date" },
          amount: { mode: "signed", column: { header: "Amount" } },
        },
      },
      text: ["Date,Value", "2026-02-03,100.25"].join("\n"),
    });
    const malformed = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: false,
        delimitersToGuess: [";"],
        dateFormat: "dd.MM.yyyy",
        numberFormat: { decimalSeparator: "," },
        mappings: {
          date: 0,
          amount: {
            mode: "debit-credit",
            debitColumn: 1,
            creditColumn: 2,
          },
        },
      },
      text: "31.02.2026;10,00;5,00",
    });

    expect(missingHeader.errors).toContain(
      'CSV header is missing mapped column "Amount".',
    );
    expect(malformed.errors).toEqual(
      expect.arrayContaining([
        "Row 1: date must match dd.MM.yyyy.",
        "Row 1: debit and credit cannot both be set.",
      ]),
    );
  });

  test("ignores extra trailing columns", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      text: [
        "date,amount,original amount,original currency,exchange rate,description,balance,unused",
        "2026-02-03,100.25,92.50,EUR,1.083784,Transfer,5000,ignored",
      ].join("\n"),
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      amount: 100.25,
      originalAmount: 92.5,
      originalCurrency: "EUR",
      description: "Transfer",
    });
  });

  test("ignores exchange rate values", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      text: [
        "date;amount;original amount;original currency;exchange rate;description",
        "2026-02-03;100.25;92.50;EUR;not a rate;Transfer",
        "2026-02-04;80.00;75.00;EUR;1,25;Payment",
      ].join("\n"),
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts[0]).not.toHaveProperty("exchangeRate");
    expect(result.drafts[0]).toMatchObject({
      amount: 100.25,
      originalAmount: 92.5,
      originalCurrency: "EUR",
      description: "Transfer",
    });
    expect(result.drafts[1]).toMatchObject({
      amount: 80,
      originalAmount: 75,
      originalCurrency: "EUR",
      description: "Payment",
    });
  });

  test("rejects rows with extra columns not declared by the header", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      text: [
        "date,amount,original amount,original currency,exchange rate,description",
        "2026-02-03,100.25,92.50,EUR,1,25,Transfer",
      ].join("\n"),
    });

    expect(result.drafts).toEqual([]);
    expect(result.errors).toContain(
      "Row 2: CSV row has more columns than the header row; check for unquoted delimiters in values.",
    );
  });

  test("rejects shifted rows when extra header columns hide the column count mismatch", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      text: [
        "date,amount,original amount,original currency,exchange rate,description,balance",
        "2026-02-03,100.25,92.50,EUR,1,25,Transfer",
      ].join("\n"),
    });

    expect(result.drafts).toEqual([]);
    expect(result.errors).toContain(
      "Row 2: CSV row appears to have an unquoted decimal comma before the description column; use semicolon delimiter or quote the value.",
    );
  });

  test("rejects shifted rows for header-name mapped exchange rates", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: true,
        delimitersToGuess: [","],
        mappings: {
          date: { header: "date" },
          amount: { mode: "signed", column: { header: "amount" } },
          originalAmount: { header: "original amount" },
          originalCurrency: { header: "original currency" },
          exchangeRate: { header: "exchange rate" },
          description: { header: "description" },
        },
      },
      text: [
        "date,amount,original amount,original currency,exchange rate,description,balance",
        "2026-02-03,100.25,92.50,EUR,1,25,Transfer",
      ].join("\n"),
    });

    expect(result.drafts).toEqual([]);
    expect(result.errors).toContain(
      "Row 2: CSV row appears to have an unquoted decimal comma before the description column; use semicolon delimiter or quote the value.",
    );
  });

  test("allows blank original amount and original currency", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      text: [
        "date,amount,original amount,original currency,exchange rate,description",
        "2026-02-03,100.25,,,,Transfer",
      ].join("\n"),
    });

    expect(result.errors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      amount: 100.25,
      originalAmount: undefined,
      originalCurrency: undefined,
      transaction: {
        bookings: [
          {
            accountId: "asset-1",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 100.25,
          },
          {
            accountId: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -100.25,
          },
        ],
      },
    });
  });

  test("requires original amount and original currency to be provided together", () => {
    const missingCurrency = parseWithLegacyFormat({
      currentAccount,
      text: [
        "date,amount,original amount,original currency,exchange rate,description",
        "2026-02-03,100.25,92.50,,,Transfer",
      ].join("\n"),
    });
    const missingAmount = parseWithLegacyFormat({
      currentAccount,
      text: [
        "date,amount,original amount,original currency,exchange rate,description",
        "2026-02-03,100.25,,EUR,,Transfer",
      ].join("\n"),
    });

    expect(missingCurrency.errors).toContain(
      "Row 2: original currency is required when original amount is set.",
    );
    expect(missingAmount.errors).toContain(
      "Row 2: original amount is required when original currency is set.",
    );
  });

  test("rejects CSVs with fewer than six columns", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      text: ["date,amount,original amount", "2026-02-03,100.25,92.50"].join(
        "\n",
      ),
    });

    expect(result.drafts).toEqual([]);
    expect(result.errors[0]).toBe(
      "CSV must include at least 6 columns in this order: date, amount, original amount, original currency, exchange rate, description",
    );
  });

  test("rejects headerless CSVs instead of dropping the first data row", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      text: [
        "2026-02-03,100.25,92.50,EUR,1.083784,First transaction",
        "2026-02-04,80.00,75.00,EUR,ignored,Second transaction",
      ].join("\n"),
    });

    expect(result.drafts).toEqual([]);
    expect(result.errors).toContain(
      "CSV must include a header row before transaction rows.",
    );
  });

  test("rejects headerless CSVs when the first transaction row is invalid", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      text: [
        "2026-02-03,100.25,92.50,eur,1.083784,First transaction",
        "2026-02-04,80.00,75.00,EUR,ignored,Second transaction",
      ].join("\n"),
    });

    expect(result.drafts).toEqual([]);
    expect(result.errors).toContain(
      "CSV must include a header row before transaction rows.",
    );
  });

  test("rejects headerless CSVs when the first row has localized date and amount values", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      text: [
        "03.02.2026;100,25;92,50;EUR;ignored;First transaction",
        "2026-02-04;80.00;75.00;EUR;ignored;Second transaction",
      ].join("\n"),
    });

    expect(result.drafts).toEqual([]);
    expect(result.errors).toContain(
      "CSV must include a header row before transaction rows.",
    );
  });

  test("rejects headerless CSVs for indexed mappings with a configured header row", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      format: {
        hasHeader: true,
        delimitersToGuess: [","],
        mappings: {
          date: 0,
          amount: { mode: "signed", column: 1 },
          description: 2,
        },
      },
      text: [
        "2026-02-03,100.25,First transaction",
        "2026-02-04,80.00,Second transaction",
      ].join("\n"),
    });

    expect(result.drafts).toEqual([]);
    expect(result.errors).toContain(
      "CSV must include a header row before transaction rows.",
    );
  });

  test("rejects invalid dates and numeric fields", () => {
    const result = parseWithLegacyFormat({
      currentAccount,
      text: [
        "date,amount,original amount,original currency,exchange rate,description",
        "03.02.2026,100,00.50,eur,0,Transfer",
      ].join("\n"),
    });

    expect(result.drafts).toEqual([]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Row 2: date must be ISO yyyy-mm-dd.",
        "Row 2: original amount must be a dot-decimal number.",
        "Row 2: original currency must be a 3-letter uppercase code.",
      ]),
    );
  });
});
