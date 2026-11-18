import { useEffect, useState } from "react";
import { Button, Stack, Text } from "@mantine/core";
import { Temporal } from "@/shared/temporal";
import { useUserLocale } from "@/user-locale-context";

export function HistoryRetry({
  retryAt,
  onRetry,
}: {
  retryAt?: string;
  onRetry: () => void;
}) {
  const locale = useUserLocale();
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    const remaining = retryAt
      ? Math.ceil(
          Temporal.Instant.from(retryAt)
            .since(Temporal.Now.instant())
            .total({ unit: "milliseconds" }),
        )
      : 0;
    setWaiting(remaining > 0);
    if (remaining <= 0) return;
    const timer = setTimeout(() => setWaiting(false), remaining);
    return () => clearTimeout(timer);
  }, [retryAt]);
  const blocked =
    waiting ||
    (!!retryAt &&
      Temporal.Instant.compare(
        Temporal.Instant.from(retryAt),
        Temporal.Now.instant(),
      ) > 0);
  return (
    <Stack gap="xs" align="start">
      {blocked && retryAt && (
        <Text size="sm" role="status">
          Retry available at{" "}
          {new Intl.DateTimeFormat(locale, { timeStyle: "medium" }).format(
            new Date(retryAt),
          )}
          .
        </Text>
      )}
      <Button variant="light" disabled={blocked} onClick={onRetry}>
        Retry Price History
      </Button>
    </Stack>
  );
}
