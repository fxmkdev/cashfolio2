import { createServerFn } from "@tanstack/react-start";
import { ensureAuthorizedForAccountBookId } from "@/account-books/functions.server";
import { prisma } from "@/prisma.server";
import { getBookingUnitFields } from "@/shared/booking-unit-fields";
import { addUtcDays, formatUtcDate, parseUtcDayDate } from "@/shared/date";
import { toMoney } from "@/shared/money";
import { assertRecord, requireStringField } from "./input-validation";

export type StatementImportExistingBooking = {
  id: string;
  transactionId: string;
  date: string;
  amount: string;
  description: string;
};

export const getStatementImportExistingBookings = createServerFn({
  method: "GET",
})
  .inputValidator((data: unknown) => {
    assertRecord(data);
    const accountBookId = requireStringField(data, "accountBookId");
    const accountId = requireStringField(data, "accountId");
    const from = parseUtcDayDate(requireStringField(data, "from"));
    const to = parseUtcDayDate(requireStringField(data, "to"));
    if (!from || !to || from > to) {
      throw new Error("A valid inclusive UTC date range is required.");
    }
    return { accountBookId, accountId, from, to };
  })
  .handler(async ({ data }): Promise<StatementImportExistingBooking[]> => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const account = await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: {
          id: data.accountId,
          accountBookId: data.accountBookId,
        },
      },
      select: {
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
      },
    });
    // Security unit identity is symbol-based; trade currency only affects pricing.
    const { tradeCurrency: _tradeCurrency, ...unitFields } =
      getBookingUnitFields(account);
    const bookings = await prisma.booking.findMany({
      where: {
        accountBookId: data.accountBookId,
        accountId: data.accountId,
        date: { gte: data.from, lt: addUtcDays(data.to, 1) },
        ...unitFields,
      },
      select: {
        id: true,
        transactionId: true,
        date: true,
        value: true,
        description: true,
        transaction: { select: { description: true } },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
    return bookings.map((booking) => ({
      id: booking.id,
      transactionId: booking.transactionId,
      date: formatUtcDate(booking.date),
      amount: toMoney(booking.value).toString(),
      description: booking.description || booking.transaction.description,
    }));
  });
