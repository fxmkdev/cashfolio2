import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconCopy } from "@tabler/icons-react";
import { useUserLocale } from "@/user-locale-context";
import { SecurityPriceChart } from "./price-chart";
import type { HistoryState, PriceRange, SecurityListing } from "./types";
import classes from "./security-search.module.css";

export function SecurityDetails({
  listing,
  history,
  range,
  onRangeChange,
  onRetryHistory,
  onCopySymbol,
}: {
  listing: SecurityListing;
  history: HistoryState;
  range: PriceRange;
  onRangeChange: (range: PriceRange) => void;
  onRetryHistory: () => void;
  onCopySymbol: (symbol: string) => Promise<void>;
}) {
  const locale = useUserLocale();
  const [copyState, setCopyState] = useState<
    "idle" | "copying" | "copied" | "error"
  >("idle");
  const latest = history.status === "ready" ? history.points.at(-1) : undefined;
  const fields = [
    ["Symbol", listing.symbol],
    ["Exchange", listing.exchange],
    ["MIC", listing.mic],
    ["Country", listing.country],
    ["Security Type", listing.securityType],
    ["Quote Currency", listing.currency],
    ["Historical Prices", listing.hasHistory ? "Available" : "Unavailable"],
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
    <Paper component="section" aria-label="Security Details" withBorder p="lg">
      <Stack gap="lg">
        <Group justify="space-between" align="start">
          <Stack gap={4}>
            <Title order={2}>{listing.name}</Title>
            <Text c="dimmed" size="sm">
              {listing.symbol} · {listing.exchange ?? "Unknown exchange"}
              {listing.mic ? ` (${listing.mic})` : ""}
            </Text>
          </Stack>
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
                {label}
              </Text>
              <Text component="dd" size="sm" fw={500}>
                {value ?? "Unknown"}
              </Text>
            </div>
          ))}
        </dl>
        {!listing.hasHistory ? (
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
                  <Button variant="light" onClick={onRetryHistory}>
                    Retry Price History
                  </Button>
                </Stack>
              </Alert>
            ) : history.points.length === 0 ? (
              <Text role="status">No prices are available for this range.</Text>
            ) : (
              <>
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
                  range={range}
                />
                <Text size="xs" c="dimmed" aria-label="Chart Period">
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  }).formatRange(
                    new Date(`${history.points[0]!.date}T00:00:00Z`),
                    new Date(`${history.points.at(-1)!.date}T00:00:00Z`),
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
