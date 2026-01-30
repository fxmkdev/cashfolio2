import { addDays, format, getYear } from "date-fns";
import { useAccountBook } from "~/account-books/hooks";
import { today } from "~/dates";
import {
  periodOrPeriodSpecifierKey,
  saveViewPreference,
} from "~/view-preferences/functions";
import type { Period } from "./types";
import type { ReactNode } from "react";
import clsx from "clsx";
import { Group, NativeSelect } from "@mantine/core";

export function PeriodSelector({
  periodSpecifier,
  period,
  minBookingDate,
  onNavigate,
  additionalControls,
}: {
  periodSpecifier: string;
  period: Period;
  minBookingDate: string;
  onNavigate: (newPeriodOrPeriodSpecifier: string) => void;
  additionalControls?: ReactNode;
}) {
  const accountBook = useAccountBook();
  return (
    <Group align="center" gap="sm">
      <NativeSelect
        value={periodSpecifier}
        onChange={(e) => {
          const newPeriodSpecifier = e.target.value;

          const newPeriodOrPeriodSpecifier =
            newPeriodSpecifier === "month"
              ? format(today(), "yyyy-MM")
              : newPeriodSpecifier === "quarter"
                ? `${format(today(), "yyyy-QQQ").toLowerCase()}`
                : newPeriodSpecifier === "year"
                  ? format(today(), "yyyy")
                  : newPeriodSpecifier;

          onNavigate(newPeriodOrPeriodSpecifier);
          saveViewPreference(
            periodOrPeriodSpecifierKey(accountBook.id),
            newPeriodOrPeriodSpecifier,
          );
        }}
      >
        <optgroup label="Monthly">
          <option value="mtd">Month to Date</option>
          <option value="last-month">Last Month</option>
          <option value="month">Select Month…</option>
        </optgroup>
        <optgroup label="Quarterly">
          <option value="qtd">Quarter to Date</option>
          <option value="last-quarter">Last Quarter</option>
          <option value="quarter">Select Quarter…</option>
        </optgroup>
        <optgroup label="Yearly">
          <option value="ytd">Year to Date</option>
          <option value="last-year">Last Year</option>
          <option value="year">Select Year…</option>
        </optgroup>
      </NativeSelect>
      <NativeSelect
        disabled={!["month", "quarter", "year"].includes(periodSpecifier)}
        onChange={(e) => {
          const newYear = Number(e.target.value);
          const newPeriod =
            period.granularity === "year"
              ? newYear.toString()
              : period.granularity === "quarter"
                ? `${newYear}-q${period.quarter}`
                : `${newYear}-${(period.month + 1)
                    .toString()
                    .padStart(2, "0")}`;
          onNavigate(newPeriod);
          saveViewPreference(
            periodOrPeriodSpecifierKey(accountBook.id),
            newPeriod,
          );
        }}
        value={period.year.toString()}
      >
        {new Array(getYear(today()) - getYear(addDays(minBookingDate, 1)) + 1)
          .fill(getYear(addDays(minBookingDate, 1)))
          .map((year, i) => (
            <option key={year + i} value={(year + i).toString()}>
              {year + i}
            </option>
          ))
          .toReversed()}
      </NativeSelect>
      {period.granularity === "quarter" && (
        <NativeSelect
          value={period.quarter.toString()}
          onChange={(e) => {
            const newQuarter = Number(e.target.value);
            const newPeriod = `${period.year}-q${newQuarter}`;
            onNavigate(newPeriod);
            saveViewPreference(
              periodOrPeriodSpecifierKey(accountBook.id),
              newPeriod,
            );
          }}
          disabled={periodSpecifier !== "quarter"}
        >
          <option value="4">Q4</option>
          <option value="3">Q3</option>
          <option value="2">Q2</option>
          <option value="1">Q1</option>
        </NativeSelect>
      )}
      {period.granularity === "month" && (
        <NativeSelect
          value={period.month.toString()}
          onChange={(e) => {
            const newMonth = Number(e.target.value);
            const newPeriod = `${period.year}-${(newMonth + 1)
              .toString()
              .padStart(2, "0")}`;
            onNavigate(newPeriod);
            saveViewPreference(
              periodOrPeriodSpecifierKey(accountBook.id),
              newPeriod,
            );
          }}
          disabled={periodSpecifier !== "month"}
        >
          <option value="11">December</option>
          <option value="10">November</option>
          <option value="9">October</option>
          <option value="8">September</option>
          <option value="7">August</option>
          <option value="6">July</option>
          <option value="5">June</option>
          <option value="4">May</option>
          <option value="3">April</option>
          <option value="2">March</option>
          <option value="1">February</option>
          <option value="0">January</option>
        </NativeSelect>
      )}

      {additionalControls}
    </Group>
  );
}
