import { Center, Group, Loader, Stack, Stepper, Text } from "@mantine/core";
import { IconFileUpload, IconTable } from "@tabler/icons-react";
import { DataGrid } from "@/components/data-grid";
import { gridTheme } from "@/components/grid-theme";
import type { AccountOption } from "@/components/edit-transaction-modal";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { PageShell } from "@/components/page-shell";
import { TopPageHeader } from "@/components/top-page-header";
import type { AccountBookUnitUsage } from "@/shared/account-book-unit-usage";
import type { TransactionMutationValues } from "./-page-view";
import type { LedgerAccount } from "./-page-types";
import type { StatementImportCsvFormat } from "./-statement-import";
import { StatementImportActions } from "./-statement-import-actions";
import { StatementImportDiscardModal } from "./-statement-import-discard-modal";
import { StatementImportEditModal } from "./-statement-import-edit-modal";
import {
  StatementImportReviewSummary,
  StatementImportFileControls,
  StatementImportParseErrors,
} from "./-statement-import-file-controls";
import { useStatementImportPageState } from "./-statement-import-page-state";
import { isStatementImportReviewDraftRow } from "./-statement-import-page-controller";

const statementImportGridTheme = gridTheme.withParams({
  selectedRowBackgroundColor: "transparent",
});

type StatementImportPageViewProps = {
  accountBookId: string;
  account: LedgerAccount;
  statementImportCsvFormat: StatementImportCsvFormat;
  accountBookStartDate: Date;
  accountOptions: AccountOption[];
  persistedBalance: number;
  unitUsage: AccountBookUnitUsage;
  isSubmitting: boolean;
  isImportComplete: boolean;
  period?: string;
  onSubmittingChange: (isSubmitting: boolean) => void;
  onSubmit: (transactions: TransactionMutationValues[]) => Promise<void>;
};

export function AccountStatementImportPageView({
  accountBookId,
  account,
  statementImportCsvFormat,
  accountBookStartDate,
  accountOptions,
  persistedBalance,
  unitUsage,
  isSubmitting,
  isImportComplete,
  period,
  onSubmittingChange,
  onSubmit,
}: StatementImportPageViewProps) {
  const state = useStatementImportPageState({
    accountBookId,
    account,
    statementImportCsvFormat,
    accountBookStartDate,
    accountOptions,
    persistedBalance,
    isSubmitting,
    isImportComplete,
    onSubmittingChange,
    onSubmit,
  });
  const activeStep = state.activeStep === "upload" ? 0 : 1;

  return (
    <PageShell>
      <TopPageHeader
        heading={
          <PageBreadcrumbs
            items={[
              {
                label: account.name,
                to: "/$accountBookId/$accountId",
                params: { accountBookId, accountId: account.id },
                search: { period },
                disabled: isSubmitting || state.isEditSubmitting,
              },
              { label: "Import Statement" },
            ]}
          />
        }
      />

      <Stepper
        active={activeStep}
        flex={1}
        mih={0}
        styles={{
          root: {
            display: "flex",
            flexDirection: "column",
          },
          content: {
            display: "flex",
            flex: 1,
            flexDirection: "column",
            minHeight: 0,
          },
          steps: {
            alignSelf: "center",
            maxWidth: 640,
            width: "100%",
          },
        }}
        onStepClick={state.handleStepClick}
      >
        <Stepper.Step
          label="Upload"
          icon={<IconFileUpload size={18} />}
          allowStepSelect={!isSubmitting && !state.isEditSubmitting}
        >
          <Center flex={1} mih={240}>
            <Stack align="center" gap="md" w="100%">
              <StatementImportFileControls
                file={state.file}
                isSubmitting={isSubmitting}
                onFileChange={(nextFile) =>
                  void state.handleFileChange(nextFile)
                }
              />

              <StatementImportParseErrors parseErrors={state.parseErrors} />
              {state.isCheckingExistingBookings ? (
                <Group gap="xs" role="status">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">
                    Checking for existing transactions…
                  </Text>
                </Group>
              ) : null}
            </Stack>
          </Center>
        </Stepper.Step>

        <Stepper.Step
          label="Review"
          icon={<IconTable size={18} />}
          allowStepSelect={
            state.canReviewStatementImport &&
            !isSubmitting &&
            !state.isEditSubmitting
          }
        >
          <Stack gap="md" flex={1} mih={0}>
            <Stack gap={0} flex={1} mih={0}>
              <StatementImportReviewSummary summaryText={state.summaryText} />

              <DataGrid
                context={{
                  onCellEditorDirtyChange: state.setIsReviewCellDirty,
                }}
                theme={statementImportGridTheme}
                containerStyle={{
                  flex: 1,
                  minHeight: 0,
                  borderTopLeftRadius: 0,
                  borderTopRightRadius: 0,
                }}
                rowData={state.reviewRows}
                columnDefs={state.columnDefs}
                suppressColumnVirtualisation={true}
                getRowId={({ data }) => data.id}
                defaultColDef={{
                  editable: false,
                  sortable: false,
                  suppressHeaderMenuButton: true,
                }}
                rowClassRules={{
                  "statement-import-row-ignored": ({ data }) =>
                    !!data && "ignored" in data && !!data.ignored,
                }}
                rowSelection={{
                  mode: "multiRow",
                  checkboxes: ({ data }) =>
                    isStatementImportReviewDraftRow(data),
                  headerCheckbox: true,
                  hideDisabledCheckboxes: true,
                  isRowSelectable: ({ data }) =>
                    isStatementImportReviewDraftRow(data),
                  enableClickSelection: false,
                }}
                onCellValueChanged={state.handleDraftCellChange}
                onSelectionChanged={state.handleSelectionChange}
                onRowDataUpdated={state.handleReviewRowsUpdated}
                onFirstDataRendered={state.handleReviewRowsUpdated}
              />
            </Stack>

            <StatementImportActions
              draftsLength={state.drafts.length}
              includedCount={state.includedCount}
              importDisabled={state.importDisabled}
              isSubmitting={isSubmitting}
              onImport={() => void state.handleImport()}
            />
          </Stack>
        </Stepper.Step>
      </Stepper>

      <StatementImportDiscardModal
        opened={state.discardModalOpened}
        action={state.discardAction}
        onClose={state.closeDiscardModal}
        onConfirm={state.confirmDiscard}
      />

      <StatementImportEditModal
        onDirtyChange={state.setIsEditorDirty}
        account={account}
        accountBookStartDate={accountBookStartDate}
        accountOptions={accountOptions}
        editingDraft={state.editingDraft}
        isEditSubmitting={state.isEditSubmitting}
        unitUsage={unitUsage}
        onClose={state.closeEditDraft}
        onSaveDraft={state.handleSaveDraft}
        onSubmittingChange={state.setIsEditSubmitting}
      />
    </PageShell>
  );
}
