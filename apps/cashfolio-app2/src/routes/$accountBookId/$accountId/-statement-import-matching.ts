import type { StatementImportExistingBooking } from "@/server/statement-import";
import { formatUtcDate } from "@/shared/date";
import { toMoney } from "@/shared/money";
import type { StatementImportDraft } from "./-statement-import-types";

export function matchStatementImportDrafts(
  drafts: StatementImportDraft[],
  bookings: StatementImportExistingBooking[],
): StatementImportDraft[] {
  const groups = new Map<string, StatementImportExistingBooking[]>();
  for (const booking of bookings) {
    const key = getMatchKey(booking.date, booking.amount);
    const group = groups.get(key) ?? [];
    group.push(booking);
    groups.set(key, group);
  }
  const matches = new Map<string, StatementImportExistingBooking>();
  const orderedDrafts = [...drafts].sort(
    (left, right) => left.sourceRowNumber - right.sourceRowNumber,
  );
  // Reserve exact descriptions before assigning description-independent matches.
  for (const exactDescription of [true, false]) {
    for (const draft of orderedDrafts) {
      if (matches.has(draft.id)) continue;
      const group = groups.get(getMatchKey(draft.date, draft.amount));
      if (!group?.length) continue;
      const index = exactDescription
        ? group.findIndex(
            (booking) => booking.description === draft.description,
          )
        : 0;
      if (index < 0) continue;
      const [booking] = group.splice(index, 1);
      matches.set(draft.id, booking);
    }
  }
  return drafts.map((draft) => {
    const booking = matches.get(draft.id);
    return booking
      ? {
          ...draft,
          ignored: true,
          matchedExistingBooking: {
            id: booking.id,
            transactionId: booking.transactionId,
          },
        }
      : draft;
  });
}

function getMatchKey(date: string, amount: string | number): string {
  return `${formatUtcDate(new Date(date))}:${toMoney(amount).toString()}`;
}
