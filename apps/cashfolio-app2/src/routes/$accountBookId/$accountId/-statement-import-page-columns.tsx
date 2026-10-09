import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import { ActionIcon, Badge, Group, Tooltip } from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
import { useMemo } from "react";
import {
  ACCOUNT_TREE_SELECT_COLUMN,
  DATE_COLUMN,
  FORMATTED_NUMERIC_COLUMN,
  TEXT_COLUMN,
} from "@/components/column-types";
import type { AccountOption } from "@/components/edit-transaction-modal";
import { getUnitDisplayDecimals } from "@/shared/unit-format";
import type { LedgerAccount } from "./-page-types";
import type { StatementImportDraftStatus } from "./-statement-import";
import { hasStatementImportSingleCounterBooking } from "./-statement-import";
import {
  isStatementImportReviewDraftRow,
  type StatementImportGridRow,
} from "./-statement-import-page-controller";

export function useStatementImportColumnDefs(args: {
  account: LedgerAccount;
  counterAccountOptions: AccountOption[];
  isSubmitting: boolean;
  statuses: Map<string, StatementImportDraftStatus>;
  onEditDraft: (draftId: string) => void;
}): ColDef<StatementImportGridRow>[] {
  const {
    account,
    counterAccountOptions,
    isSubmitting,
    onEditDraft,
    statuses,
  } = args;

  return useMemo(
    () => [
      {
        colId: "status",
        headerName: "Status",
        width: 135,
        cellRenderer: ({
          data,
        }: ICellRendererParams<StatementImportGridRow>) => {
          if (!isStatementImportReviewDraftRow(data)) return null;
          const status = statuses.get(data.id);
          if (!status) return null;
          return (
            <Tooltip label={status.message ?? status.label}>
              <Badge color={status.color} variant="light">
                {status.label}
              </Badge>
            </Tooltip>
          );
        },
      },
      {
        field: "date",
        headerName: "Date",
        width: 130,
        type: DATE_COLUMN,
        cellDataType: "dateString",
      },
      {
        field: "amount",
        headerName: "Amount",
        width: 130,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        field: "description",
        headerName: "Description",
        minWidth: 190,
        flex: 1,
        editable: ({ data }) =>
          !isSubmitting &&
          isStatementImportReviewDraftRow(data) &&
          !data.ignored,
        type: TEXT_COLUMN,
      },
      {
        field: "counterAccountId",
        headerName: "Counter Account",
        width: 215,
        editable: ({ data }) =>
          !isSubmitting &&
          isStatementImportReviewDraftRow(data) &&
          !data.ignored &&
          hasStatementImportSingleCounterBooking(data),
        cellRenderer: ({
          data,
          value,
        }: ICellRendererParams<StatementImportGridRow>) => {
          if (!isStatementImportReviewDraftRow(data)) return null;
          if (!hasStatementImportSingleCounterBooking(data)) {
            return (
              <Badge color="gray" variant="light">
                Multiple
              </Badge>
            );
          }

          return (
            counterAccountOptions.find((option) => option.value === value)
              ?.label ?? ""
          );
        },
        type: ACCOUNT_TREE_SELECT_COLUMN,
        context: {
          options: counterAccountOptions,
        },
      },
      {
        field: "originalCurrency",
        headerName: "Original Ccy.",
        width: 110,
      },
      {
        field: "originalAmount",
        headerName: "Original Amount",
        width: 145,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        field: "balance",
        headerName: getStatementImportBalanceHeaderName(),
        width: 155,
        type: FORMATTED_NUMERIC_COLUMN,
        context: {
          formattedNumeric: {
            getDisplayDecimals: () =>
              getUnitDisplayDecimals({
                unit: account.unit,
                currency: account.currency,
                cryptocurrency: account.cryptocurrency,
              }),
          },
        },
      },
      {
        colId: "actions",
        headerName: "",
        width: 55,
        pinned: "right",
        sortable: false,
        filter: false,
        resizable: false,
        suppressHeaderMenuButton: true,
        cellClass: "actions-cell",
        cellRenderer: ({
          data,
        }: ICellRendererParams<StatementImportGridRow>) => {
          if (!isStatementImportReviewDraftRow(data)) return null;
          const editDisabled = isSubmitting || data.ignored;
          return (
            <Group gap={4} wrap="nowrap" h="100%" align="center">
              <Tooltip
                label={data.ignored ? "Ignored rows cannot be edited" : "Edit"}
              >
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  disabled={editDisabled}
                  onClick={() => onEditDraft(data.id)}
                  aria-label="Edit Imported Transaction"
                >
                  <IconPencil size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          );
        },
      },
    ],
    [account, counterAccountOptions, isSubmitting, onEditDraft, statuses],
  );
}

export function getStatementImportBalanceHeaderName(): string {
  return "Balance";
}
