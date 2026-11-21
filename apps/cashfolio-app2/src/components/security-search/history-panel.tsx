import {
  Alert,
  Badge,
  Group,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useUserLocale } from "@/user-locale-context";
import { SecurityPriceChart } from "./price-chart";
import { HistoryRetry } from "./history-retry";
import { historyChartData } from "./history-chart-data";
import type { HistoryState, PriceRange, SecurityListing } from "./types";

export function SecurityHistoryPanel({
  listing,
  history,
  range,
  onRangeChange,
  onRetryHistory,
}: {
  listing: SecurityListing;
  history: HistoryState;
  range: PriceRange;
  onRangeChange: (range: PriceRange) => void;
  onRetryHistory: () => void;
}) {
  const locale = useUserLocale();
  const latest = history.status === "ready" ? history.points.at(-1) : undefined;
  const represented =
    history.status === "ready"
      ? historyChartData(history.points, history.omissions)
      : [];
  return (
    <>
      {listing.hasHistory === false ? (
        <Alert title="Historical Prices Unavailable">
          Historical prices are unavailable for this listing. You can still copy
          its symbol.
        </Alert>
      ) : (
        <Stack gap="sm">
          <Group justify="space-between">
            <Group gap="sm">
              <Title order={3}>Price History</Title>
              {history.status === "loading" ? (
                <Skeleton
                  height={20}
                  width={56}
                  aria-label="Loading Price Currency"
                />
              ) : (
                <Badge variant="light" color="gray">
                  {listing.currency ?? "Currency Unknown"}
                </Badge>
              )}
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
            <Skeleton height={200} aria-label="Loading Price History" />
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
    </>
  );
}
