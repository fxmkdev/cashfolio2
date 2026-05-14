import { createServerFn } from "@tanstack/react-start";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import { currencies } from "../currencies";
import { prisma } from "../prisma.server";
import { ensureSameOriginRequestFromServerContext } from "../security/same-origin.server";
import { normalizeDateInputValue, startOfUtcDay } from "../shared/date";
import { ensureUser } from "../users/functions.server";

const GAIN_LOSS_ACCOUNT_NAME = "Gain/Loss";

type CreateAccountBookInput = {
  name: string;
  referenceCurrency: string;
  startDate: Date | string;
};

type CreatedAccountBook = {
  id: string;
  name: string;
  referenceCurrency: string;
  startDate: string;
};

type AccountBookRecord = {
  id: string;
  name: string;
  referenceCurrency: string;
  startDate: Date;
};

function normalizeAccountBookNameOrThrow(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Account book name is required.");
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error("Account book name is required.");
  }

  return normalized;
}

function normalizeReferenceCurrencyOrThrow(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Reference currency is required.");
  }

  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) {
    throw new Error("Reference currency is required.");
  }

  if (!Object.prototype.hasOwnProperty.call(currencies, normalized)) {
    throw new Error("Reference currency is invalid.");
  }

  return normalized;
}

function normalizeStartDateOrThrow(value: unknown): Date {
  if (value == null) {
    throw new Error("Start date is required.");
  }

  if (typeof value === "string" && value.trim().length === 0) {
    throw new Error("Start date is required.");
  }

  const normalizedInput =
    value instanceof Date || typeof value === "string" ? value : null;
  const parsed = normalizeDateInputValue(normalizedInput);
  if (!parsed) {
    throw new Error("Start date is invalid.");
  }

  const startDate = startOfUtcDay(parsed);
  const today = startOfUtcDay(new Date());
  if (startDate > today) {
    throw new Error("Start date cannot be in the future.");
  }

  return startDate;
}

function toCreatedAccountBook(record: AccountBookRecord): CreatedAccountBook {
  return {
    id: record.id,
    name: record.name,
    referenceCurrency: record.referenceCurrency.toUpperCase(),
    startDate: startOfUtcDay(record.startDate).toISOString(),
  };
}

export const createAccountBook = createServerFn({ method: "POST" })
  .inputValidator((data: CreateAccountBookInput) => data)
  .handler(async ({ data }): Promise<CreatedAccountBook> => {
    ensureSameOriginRequestFromServerContext();

    const user = await ensureUser();
    const name = normalizeAccountBookNameOrThrow(data.name);
    const referenceCurrency = normalizeReferenceCurrencyOrThrow(
      data.referenceCurrency,
    );
    const startDate = normalizeStartDateOrThrow(data.startDate);

    const created = await prisma.$transaction(async (tx) => {
      return tx.accountBook.create({
        data: {
          name,
          referenceCurrency,
          startDate,
          userLinks: {
            create: {
              userId: user.id,
            },
          },
          accounts: {
            create: {
              name: GAIN_LOSS_ACCOUNT_NAME,
              type: AccountType.EQUITY,
              equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
            },
          },
        },
        select: {
          id: true,
          name: true,
          referenceCurrency: true,
          startDate: true,
        },
      });
    });

    return toCreatedAccountBook(created);
  });
