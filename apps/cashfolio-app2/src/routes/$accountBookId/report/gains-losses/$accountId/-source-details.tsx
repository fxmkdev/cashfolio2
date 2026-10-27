import { Button, Card, Stack, Table, Text, Title } from "@mantine/core";
import { format } from "date-fns";
import type { PeriodGainLossReconciliation } from "@/shared/gain-loss-reconciliation";

export function GainLossSourceDetails({
  sources,
  currencyFormatter,
  onOpenTransaction,
  onOpenRecordedTransaction,
}: {
  sources: PeriodGainLossReconciliation["sources"];
  currencyFormatter: Intl.NumberFormat;
  onOpenTransaction: (transactionId: string) => void;
  onOpenRecordedTransaction: (transactionId: string) => void;
}) {
  if (!sources) return null;
  return (
    <Stack gap="lg">
      <Text size="sm" c="dimmed">
        Calculated realised G/L:{" "}
        {currencyFormatter.format(sources.calculatedRealizedGainLoss)}. Recorded
        adjustments: {currencyFormatter.format(sources.recordedGainLoss)}.{" "}
        Recorded adjustments are included in Realised / Recorded for reporting;
        recording an adjustment does not establish that a gain or loss was
        economically realised.
      </Text>
      {sources.attributionExplanation ? (
        <Text size="sm">{sources.attributionExplanation}</Text>
      ) : null}
      {(
        [
          [
            "Recorded Adjustments",
            sources.recordedAdjustments,
            onOpenRecordedTransaction,
          ],
          [
            "Execution Residuals",
            sources.executionResiduals,
            onOpenTransaction,
          ],
        ] as const
      ).map(([title, rows, openTransaction]) =>
        rows.length ? (
          <Card key={title} withBorder radius="md" p="md">
            <Stack gap="sm">
              <Title order={4}>{title}</Title>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Description</Table.Th>
                    <Table.Th>Amount</Table.Th>
                    <Table.Th>Transaction</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((row) => (
                    <Table.Tr key={row.id}>
                      <Table.Td>
                        {format(new Date(row.date), "dd.MM.yyyy")}
                      </Table.Td>
                      <Table.Td>{row.description ?? "—"}</Table.Td>
                      <Table.Td>
                        {currencyFormatter.format(row.amount)}
                      </Table.Td>
                      <Table.Td>
                        <Button
                          variant="subtle"
                          size="xs"
                          onClick={() => openTransaction(row.transactionId)}
                        >
                          Open Transaction
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Card>
        ) : null,
      )}
    </Stack>
  );
}
