import { useEffect, useRef, useState } from "react";
import {
  Alert,
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconArrowLeft, IconCopy, IconX } from "@tabler/icons-react";
import { useUserLocale } from "@/user-locale-context";
import { SecurityPriceChart } from "./price-chart";
import { HistoryRetry } from "./history-retry";
import { historyChartData } from "./history-chart-data";
import { getExchangeLabel } from "./exchange-label";
import { getHistoryLabel } from "@/shared/securities/contracts";
import type { HistoryState, PriceRange, SecurityListing } from "./types";
import classes from "./security-search.module.css";

export function SecurityDetails({
  listing,
  history,
  isin,
  range,
  onRangeChange,
  onRetryHistory,
  onCopySymbol,
  onClose,
}: {
  listing: SecurityListing;
  history: HistoryState;
  isin: string | null;
  range: PriceRange;
  onRangeChange: (range: PriceRange) => void;
  onRetryHistory: () => void;
  onCopySymbol: (symbol: string) => Promise<void>;
  onClose: () => void;
}) {
  const locale = useUserLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const [copyState, setCopyState] = useState<
    "idle" | "copying" | "copied" | "error"
  >("idle");
  const latest = history.status === "ready" ? history.points.at(-1) : undefined;
  const represented =
    history.status === "ready"
      ? historyChartData(history.points, history.omissions)
      : [];
  const fields: [string, string | null][] = [
    ["Symbol", listing.symbol],
    ["ISIN", isin],
    ["Exchange", getExchangeLabel(listing)],
    ["Country", listing.country],
    ["Security Type", listing.securityType],
    ["Quote Currency", listing.currency],
    ["Historical Prices", getHistoryLabel(listing.hasHistory)],
  ];

  async function copySymbol() {
    setCopyState("copying");
    try {
      await onCopySymbol(listing.symbol);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <Paper
      component="section"
      aria-label="Security Details"
      withBorder
      p="md"
      className={classes.detailsPane}
    >
      <Stack gap="lg">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={onClose}
          className={classes.backButton}
        >
          Back to Results
        </Button>
        <Group justify="space-between" align="start">
          <Stack gap={4} className={classes.detailsHeading}>
            <Title order={2} ref={heading} tabIndex={-1}>
              {listing.name}
            </Title>
            <Text c="dimmed" size="sm">
              {listing.symbol} · {getExchangeLabel(listing)}
            </Text>
          </Stack>
          <Tooltip label="Close Details">
            <ActionIcon
              variant="subtle"
              aria-label="Close Details"
              onClick={onClose}
              className={classes.closeButton}
            >
              <IconX size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Group>
          <Button
            variant="light"
            leftSection={<IconCopy size={16} />}
            onClick={copySymbol}
            loading={copyState === "copying"}
          >
            Copy Symbol
          </Button>
        </Group>
        {copyState === "copied" && (
          <Text role="status" size="sm" c="teal">
            Symbol copied.
          </Text>
        )}
        {copyState === "error" && (
          <Alert color="red" role="alert">
            Could not copy the symbol. Select and copy {listing.symbol}{" "}
            manually, or try Copy Symbol again.
          </Alert>
        )}
        <dl className={classes.summary}>
          {fields.map(([label, value]) => (
            <div key={label}>
              <Text component="dt" size="sm" c="dimmed">
                {label === "Historical Prices" ? (
                  <Tooltip label="Indicates whether historical data is listed for this security; individual prices may be missing.">
                    <span tabIndex={0}>{label}</span>
                  </Tooltip>
                ) : (
                  label
                )}
              </Text>
              <Text component="dd" size="sm" fw={500} aria-label={label}>
                {value ?? "Unknown"}
              </Text>
            </div>
          ))}
        </dl>
        {listing.hasHistory === false ? (
          <Alert title="Historical Prices Unavailable">
            Historical prices are unavailable for this listing. You can still
            copy its symbol.
          </Alert>
        ) : (
          <Stack gap="sm">
            <Group justify="space-between">
              <Group gap="sm">
                <Title order={3}>Price History</Title>
                <Badge variant="light" color="gray">
                  {listing.currency ?? "Currency Unknown"}
                </Badge>
              </Group>
              <SegmentedControl
                aria-label="Price Range"
                value={range}
                data={["1M", "6M", "1Y", "5Y"]}
                onChange={(value) => onRangeChange(value as PriceRange)}
              />
            </Group>
            <Text size="sm" c="dimmed">
              Unadjusted closing prices
            </Text>
            {history.status === "loading" ? (
              <Group role="status" mih={160} justify="center">
                <Loader size="sm" />
                <Text>Loading price history…</Text>
              </Group>
            ) : history.status === "error" ? (
              <Alert color="red" title="Price History Unavailable" role="alert">
                <Stack gap="sm" align="start">
                  <Text size="sm">{history.message}</Text>
                  <HistoryRetry onRetry={onRetryHistory} />
                </Stack>
              </Alert>
            ) : history.status === "unavailable" ? (
              <Alert
                title="Price History Unavailable"
                color={history.reason === "no-data" ? "blue" : "yellow"}
                role="alert"
              >
                <Stack gap="sm">
                  <Text size="sm">{history.message}</Text>
                  <HistoryRetry
                    retryAt={history.retryAt}
                    onRetry={onRetryHistory}
                  />
                </Stack>
              </Alert>
            ) : history.points.length === 0 ? (
              <Text role="status">
                {history.omissions.length
                  ? "No usable closing prices are available for this range."
                  : "No prices are available for this range."}
              </Text>
            ) : (
              <>
                {history.omissions.length > 0 && (
                  <Alert
                    title="Partial Price History"
                    color="yellow"
                    role="status"
                  >
                    {new Intl.NumberFormat(locale).format(
                      history.omissions.length,
                    )}{" "}
                    closing price{" "}
                    {history.omissions.length === 1
                      ? "observation is"
                      : "observations are"}{" "}
                    unavailable for this range. Gaps mark the missing
                    observations.
                  </Alert>
                )}
                {latest && (
                  <Text size="sm" aria-label="Latest Closing Price">
                    Latest close:{" "}
                    {new Intl.NumberFormat(locale, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(latest.close)}
                    {listing.currency ? ` ${listing.currency}` : ""} ·{" "}
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeZone: "UTC",
                    }).format(new Date(`${latest.date}T00:00:00Z`))}
                  </Text>
                )}
                <SecurityPriceChart
                  name={listing.name}
                  currency={listing.currency}
                  points={history.points}
                  omissions={history.omissions}
                  range={range}
                />
                <Text size="xs" c="dimmed" aria-label="Chart Period">
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  }).formatRange(
                    new Date(`${represented[0]!.date}T00:00:00Z`),
                    new Date(`${represented.at(-1)!.date}T00:00:00Z`),
                  )}
                </Text>
              </>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
