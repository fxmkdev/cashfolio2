import { readHistoryPageSize } from "../../../shared/history-window-policy";
import { Temporal } from "../../../shared/temporal";
import { toUtcPlainDate } from "../../../shared/temporal-adapters";

export function getHistoryWindow(args: {
  granularity: "month" | "year";
  minDate: Date;
  maxDate: Date;
  before?: string;
  pageSize?: number;
}) {
  const pageSize = readHistoryPageSize(args.pageSize, args.granularity);
  const month = args.granularity === "month";
  const period = (date: Date) => {
    const value = toUtcPlainDate(date).toPlainYearMonth();
    return month ? value : value.with({ month: 1 });
  };
  const duration = (value: number) =>
    month ? { months: value } : { years: value };
  const format = (value: Temporal.PlainYearMonth) =>
    month ? value.toString() : String(value.year).padStart(4, "0");
  const first = period(args.minDate);
  let last = period(args.maxDate);
  if (args.before !== undefined) {
    const pattern = month ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}$/;
    if (!pattern.test(args.before)) throw new Error("Invalid History cursor.");
    const cursor = Temporal.PlainYearMonth.from(
      month ? args.before : `${args.before}-01`,
    );
    if (Temporal.PlainYearMonth.compare(cursor, last) > 0)
      throw new Error("History cursor cannot be in the future.");
    last = cursor.subtract(duration(1));
  }
  let start = last.subtract(duration(pageSize - 1));
  if (Temporal.PlainYearMonth.compare(start, first) < 0) start = first;
  const values: string[] = [];
  for (
    let value = start;
    Temporal.PlainYearMonth.compare(value, last) <= 0;
    value = value.add(duration(1))
  )
    values.push(format(value));
  return {
    values,
    nextBefore:
      Temporal.PlainYearMonth.compare(start, first) > 0 && values.length
        ? format(start)
        : undefined,
  };
}
