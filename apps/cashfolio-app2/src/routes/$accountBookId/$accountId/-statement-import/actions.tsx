import { Button, Group, Tooltip } from "@mantine/core";
import { IconFileImport } from "@tabler/icons-react";

export function StatementImportActions({
  draftsLength,
  includedCount,
  importDisabled,
  isSubmitting,
  onImport,
}: {
  draftsLength: number;
  includedCount: number;
  importDisabled: boolean;
  isSubmitting: boolean;
  onImport: () => void;
}) {
  return (
    <Group justify="end">
      <Tooltip
        label={
          importDisabled && draftsLength > 0
            ? includedCount === 0
              ? "At least one non-ignored imported transaction is required."
              : "All non-ignored imported transactions must be ready."
            : "Create transactions"
        }
        disabled={!importDisabled || draftsLength === 0}
      >
        <span>
          <Button
            leftSection={<IconFileImport size={16} />}
            loading={isSubmitting}
            disabled={importDisabled}
            onClick={onImport}
          >
            Import Transactions
          </Button>
        </span>
      </Tooltip>
    </Group>
  );
}
