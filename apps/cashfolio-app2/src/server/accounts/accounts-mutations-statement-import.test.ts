import { beforeEach, describe, expect, it } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";
import {
  createAccount,
  resetAccountMutation,
  tx,
  updateAccount,
  validateAccountInput,
} from "./accounts-mutations.test-support";

describe("updateAccount opening balance management", () => {
  beforeEach(resetAccountMutation);

  it("persists statement import CSV formats when creating accounts", async () => {
    const statementImportCsvFormat = {
      hasHeader: true,
      delimitersToGuess: [";"],
      columns: ["date", "amount", "description"],
    };
    tx.account.create.mockResolvedValueOnce({
      id: "account-2",
      name: "Checking",
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    });

    await createAccount({
      data: {
        accountBookId: "book-1",
        name: "Checking",
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "CHF",
        statementImportCsvFormat,
      },
    });

    expect(validateAccountInput).toHaveBeenCalledWith(
      expect.objectContaining({ statementImportCsvFormat }),
      [],
    );
    expect(tx.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ statementImportCsvFormat }),
    });
  });

  it("persists statement import CSV formats when updating accounts", async () => {
    const statementImportCsvFormat = {
      hasHeader: false,
      delimitersToGuess: [";"],
      mappings: {
        date: 0,
        amount: { mode: "signed" as const, column: 2 },
        description: 1,
      },
    };

    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Cash",
        type: AccountType.BALANCE,
        statementImportCsvFormat,
      },
    });

    expect(validateAccountInput).toHaveBeenCalledWith(
      expect.objectContaining({ statementImportCsvFormat }),
      [],
    );
    expect(tx.account.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "account-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({ statementImportCsvFormat }),
    });
  });

  it("preserves statement import CSV formats when an update omits the field", async () => {
    const existingStatementImportCsvFormat = {
      hasHeader: true,
      delimitersToGuess: [","],
      columns: ["date", "amount", "description"],
    };
    tx.account.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      statementImportCsvFormat: existingStatementImportCsvFormat,
    });

    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Cash",
        type: AccountType.BALANCE,
      },
    });

    expect(tx.account.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "account-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({
        statementImportCsvFormat: existingStatementImportCsvFormat,
      }),
    });
  });
});
