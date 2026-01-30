import clsx from "clsx";
import type {
  Granularity,
  MonthPeriod,
  Period,
  QuarterPeriod,
  TimelineRange,
  TimelineView,
} from "./types";
import { useNavigate } from "react-router";
import { addDays, format, getMonth, getQuarter, getYear } from "date-fns";
import { today } from "~/dates";
import { useAccountBook } from "~/account-books/hooks";
import {
  saveViewPreference,
  timelineRangeKey,
} from "~/view-preferences/functions";
import { Group, NativeSelect } from "@mantine/core";

const YEAR_RANGE_REGEX = /^(\d{4})$/;
const QUARTER_RANGE_REGEX = /^(\d{4})-Q(\d)$/i;
const MONTH_RANGE_REGEX = /^(\d{4})-(\d{2})$/;
const LIMITED_RANGE_REGEX = /^(\d+)([ymq])$/;
const MAX_RANGE_REGEX = /^max-(year|month|quarter)$/;

export function parseRange(range: string): TimelineRange {
  const normalizedRange = range.toLowerCase().trim();

  const yearRangeResult = YEAR_RANGE_REGEX.exec(normalizedRange);
  if (yearRangeResult) {
    const [, yearString] = yearRangeResult;
    const year = Number(yearString);
    return { granularity: "year", period: { year }, numberOfPeriods: 1 };
  }

  const quarterRangeResult = QUARTER_RANGE_REGEX.exec(normalizedRange);
  if (quarterRangeResult) {
    const [, yearString, quarterString] = quarterRangeResult;
    const year = Number(yearString);
    const quarter = Number(quarterString);
    return {
      granularity: "quarter",
      period: { year, quarter },
      numberOfPeriods: 1,
    };
  }

  const monthRangeResult = MONTH_RANGE_REGEX.exec(normalizedRange);
  if (monthRangeResult) {
    const [, yearString, monthString] = monthRangeResult;
    const year = Number(yearString);
    const month = Number(monthString) - 1;
    return {
      granularity: "month",
      period: { year, month },
      numberOfPeriods: 1,
    };
  }

  // 5y  12m  4q
  const limitedRangeResult = LIMITED_RANGE_REGEX.exec(normalizedRange);
  if (limitedRangeResult) {
    const [, count, granularityChar] = limitedRangeResult;
    const granularity =
      granularityChar === "y"
        ? "year"
        : granularityChar === "m"
          ? "month"
          : granularityChar === "q"
            ? "quarter"
            : null;
    if (!granularity) {
      throw new Error(
        `bad range ${range}: invalid granularity '${granularityChar}'`,
      );
    }
    return { granularity, numberOfPeriods: Number(count) };
  }

  // max-years  max-months  max-quarters
  const maxRangeResult = MAX_RANGE_REGEX.exec(normalizedRange);
  if (maxRangeResult) {
    const [, granularity] = maxRangeResult;
    return {
      granularity: granularity as Granularity,
      numberOfPeriods: Infinity,
    };
  }

  throw new Error(`bad range ${normalizedRange}: unrecognized format`);
}

export function getInitialTimelinePeriod(range: TimelineRange): Period {
  return range.granularity === "year"
    ? {
        granularity: "year",
        year: range.period?.year ?? getYear(today()),
      }
    : range.granularity === "quarter"
      ? {
          granularity: "quarter",
          year: range.period?.year ?? getYear(today()),
          quarter: range.period?.quarter ?? getQuarter(today()),
        }
      : {
          granularity: "month",
          year: range.period?.year ?? getYear(today()),
          month: range.period?.month ?? getMonth(today()),
        };
}

export function TimelineSelector({
  className,
  period,
  rangeSpecifier,
  range,
  view,
  nodeId,
  minBookingDate,
  isBreakdownAllocationAvailable,
}: {
  className?: string;
  period: Period;
  rangeSpecifier: string;
  range: TimelineRange;
  view?: TimelineView;
  nodeId?: string;
  minBookingDate?: string;
  isBreakdownAllocationAvailable?: boolean;
}) {
  const navigate = useNavigate();
  const accountBook = useAccountBook();
  return (
    <Group justify="center" gap="sm" className={className}>
      <NativeSelect
        value={period.granularity}
        onChange={(e) => {
          const newRange =
            e.target.value === "year"
              ? "5y"
              : e.target.value === "quarter"
                ? "4q"
                : "12m";
          navigate(
            view
              ? `../income/${nodeId}/${newRange}/${view}`
              : `../timeline/${newRange}`,
          );

          saveViewPreference(timelineRangeKey(accountBook.id), newRange);
        }}
      >
        <option value="year">Years</option>
        <option value="quarter">Quarters</option>
        <option value="month">Months</option>
      </NativeSelect>
      <NativeSelect
        value={rangeSpecifier}
        onChange={(e) => {
          const newRange = e.target.value;
          navigate(
            view
              ? `../income/${nodeId}/${newRange}/${view}`
              : `../timeline/${newRange}`,
          );

          saveViewPreference(timelineRangeKey(accountBook.id), newRange);
        }}
      >
        {period.granularity === "year" ? (
          <>
            <option value="3y">Last 3 Years</option>
            <option value="5y">Last 5 Years</option>
            <option value="10y">Last 10 Years</option>
            <option value="max-year">Max</option>
            {minBookingDate && (
              <>
                <option disabled>──────────</option>
                <option value={range.period?.year ?? getYear(today())}>
                  Select Year…
                </option>
              </>
            )}
          </>
        ) : period.granularity === "quarter" ? (
          <>
            <option value="4q">Last 4 Quarters</option>
            <option value="8q">Last 8 Quarters</option>
            <option value="12q">Last 12 Quarters</option>
            <option value="24q">Last 24 Quarters</option>
            <option value="max-quarter">Max</option>
            {minBookingDate && (
              <>
                <option disabled>──────────</option>
                <option
                  value={
                    range.period
                      ? `${range.period.year}-q${(range.period as QuarterPeriod).quarter}`
                      : format(today(), "yyyy-QQQ").toLowerCase()
                  }
                >
                  Select Quarter…
                </option>
              </>
            )}
          </>
        ) : period.granularity === "month" ? (
          <>
            <option value="3m">Last 3 Months</option>
            <option value="6m">Last 6 Months</option>
            <option value="12m">Last 12 Months</option>
            <option value="24m">Last 24 Months</option>
            <option value="36m">Last 36 Months</option>
            <option value="48m">Last 48 Months</option>
            <option value="max-month">Max</option>
            {minBookingDate && (
              <>
                <option disabled>──────────</option>
                <option
                  value={
                    range.period
                      ? `${range.period.year}-${((range.period as MonthPeriod).month + 1).toString().padStart(2, "0")}`
                      : format(today(), "yyyy-MM")
                  }
                >
                  Select Month…
                </option>
              </>
            )}
          </>
        ) : null}
      </NativeSelect>
      {range.period && minBookingDate && (
        <>
          <NativeSelect
            value={range.period.year}
            onChange={(e) => {
              const newPeriod =
                range.granularity === "year"
                  ? e.currentTarget.value
                  : range.granularity === "quarter"
                    ? `${e.currentTarget.value}-q${range.period!.quarter}`
                    : `${e.currentTarget.value}-${(range.period!.month + 1)
                        .toString()
                        .padStart(2, "0")}`;
              navigate(
                view
                  ? `../income/${nodeId}/${newPeriod}/${view}`
                  : `../timeline/${newPeriod}`,
              );
            }}
          >
            {new Array(
              getYear(today()) - getYear(addDays(minBookingDate, 1)) + 1,
            )
              .fill(getYear(addDays(minBookingDate, 1)))
              .map((year, i) => (
                <option key={year + i} value={year + i}>
                  {year + i}
                </option>
              ))
              .toReversed()}
          </NativeSelect>
          {range.granularity === "quarter" && (
            <NativeSelect
              value={range.period.quarter}
              onChange={(e) => {
                const newPeriod = `${range.period!.year}-q${e.currentTarget.value}`;
                navigate(
                  view
                    ? `../income/${nodeId}/${newPeriod}/${view}`
                    : `../timeline/${newPeriod}`,
                );
              }}
            >
              <option value={4}>Q4</option>
              <option value={3}>Q3</option>
              <option value={2}>Q2</option>
              <option value={1}>Q1</option>
            </NativeSelect>
          )}
          {range.granularity === "month" && (
            <NativeSelect
              value={range.period.month}
              onChange={(e) => {
                const newPeriod = `${range.period!.year}-${(Number(e.currentTarget.value) + 1).toString().padStart(2, "0")}`;
                navigate(
                  view
                    ? `../income/${nodeId}/${newPeriod}/${view}`
                    : `../timeline/${newPeriod}`,
                );
              }}
            >
              <option value={11}>December</option>
              <option value={10}>November</option>
              <option value={9}>October</option>
              <option value={8}>September</option>
              <option value={7}>August</option>
              <option value={6}>July</option>
              <option value={5}>June</option>
              <option value={4}>May</option>
              <option value={3}>April</option>
              <option value={2}>March</option>
              <option value={1}>February</option>
              <option value={0}>January</option>
            </NativeSelect>
          )}
        </>
      )}

      {view && (
        <NativeSelect
          value={view}
          onChange={(e) => {
            navigate(
              `../income/${nodeId}/${rangeSpecifier}/${e.currentTarget.value}`,
            );
          }}
        >
          <option value="totals">Totals</option>
          <option value="breakdown">Breakdown</option>
          {range.numberOfPeriods === 1 && (
            <>
              <option value="breakdown-table">Breakdown (Table)</option>
              {isBreakdownAllocationAvailable && (
                <option value="breakdown-allocation">
                  Breakdown (Allocation)
                </option>
              )}
            </>
          )}
        </NativeSelect>
      )}
    </Group>
  );
}
