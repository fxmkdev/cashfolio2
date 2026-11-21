import { useEffect, useRef, useState } from "react";
import {
  Alert,
  ActionIcon,
  Button,
  Group,
  Skeleton,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconArrowLeft, IconCopy, IconX } from "@tabler/icons-react";
import { SecurityHistoryPanel } from "./history-panel";
import { getExchangeLabel } from "./exchange-label";
import { getHistoryLabel } from "@/shared/securities/contracts";
import type { HistoryState, PriceRange, SecurityListing } from "./types";
import classes from "./security-search.module.css";

export function SecurityDetails({
  listing,
  history,
  isin,
  metadataPending = false,
  range,
  onRangeChange,
  onRetryHistory,
  onCopySymbol,
  onClose,
}: {
  listing: SecurityListing;
  history: HistoryState;
  isin: string | null;
  metadataPending?: boolean;
  range: PriceRange;
  onRangeChange: (range: PriceRange) => void;
  onRetryHistory: () => void;
  onCopySymbol: (symbol: string) => Promise<void>;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const [copyState, setCopyState] = useState<
    "idle" | "copying" | "copied" | "error"
  >("idle");
  const fields: [string, string | null, boolean?][] = [
    ["Symbol", listing.symbol],
    ["ISIN", isin, metadataPending],
    ["Exchange", getExchangeLabel(listing)],
    ["Country", listing.country],
    ["Security Type", listing.securityType, history.status === "loading"],
    ["Quote Currency", listing.currency, history.status === "loading"],
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
          {fields.map(([label, value, pending]) => (
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
              <Text
                component="dd"
                size="sm"
                fw={500}
                aria-label={label}
                aria-busy={pending || undefined}
              >
                {pending ? (
                  <Skeleton
                    height={16}
                    width={100}
                    aria-label={`Loading ${label}`}
                  />
                ) : (
                  (value ?? "Unknown")
                )}
              </Text>
            </div>
          ))}
        </dl>
        <SecurityHistoryPanel
          listing={listing}
          history={history}
          range={range}
          onRangeChange={onRangeChange}
          onRetryHistory={onRetryHistory}
        />
      </Stack>
    </Paper>
  );
}
