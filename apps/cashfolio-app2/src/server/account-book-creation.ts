import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import { ensureSameOriginRequestFromServerContext } from "../security/same-origin.server";
import { startOfUtcDay } from "../shared/date";
import { ensureUser } from "../users/functions.server";
import {
  normalizeAccountBookNameOrThrow,
  normalizeReferenceCurrencyOrThrow,
  normalizeStartDateOrThrow,
} from "./account-book-validation";

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
