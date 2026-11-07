import { Button, Group, Stack, TextInput, Tooltip } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { IconInfoCircle, IconTablePlus } from "@tabler/icons-react";
import {
  getDateInputValueFormat,
  normalizeDateInputValue,
} from "@/shared/date";
import { DataGrid } from "../../grid/data-grid";
import { MutationSubmitFeedback } from "../../dialogs/mutation-submit-feedback";
import { isEditableCell } from "../edit-transaction-modal-columns";
import type { useEditTransactionModalController } from "./controller";

type Model = ReturnType<typeof useEditTransactionModalController>;

export function EditTransactionModalView({
  props,
  form,
  submitState,
  grid,
  userLocale,
  accountBookStartDay,
  dateInputHandlers,
  handleSubmit,
}: Model) {
  const { isSubmitting } = submitState;
  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <MutationSubmitFeedback
          state={submitState}
          onRefreshConstraints={props.onRefreshConstraints}
        />
        <Group align="start">
          <DateInput
            valueFormat={getDateInputValueFormat(userLocale)}
            dateParser={(value) => normalizeDateInputValue(value, userLocale)}
            w={140}
            label={
              <Group gap={4}>
                Date
                <Tooltip
                  label={
                    <>
                      Changing this date overwrites all booking dates.
                      <br /> Individual bookings can be set to a later date.
                    </>
                  }
                  position="bottom-start"
                >
                  <IconInfoCircle size={16} />
                </Tooltip>
              </Group>
            }
            disabled={isSubmitting}
            minDate={accountBookStartDay}
            data-autofocus={props.autoFocusDate || undefined}
            {...form.getInputProps("date")}
            {...dateInputHandlers}
          />
          <TextInput
            label="Description"
            {...form.getInputProps("description")}
            disabled={isSubmitting}
            flex="1"
          />
          <Button
            type="button"
            mt={24.8}
            variant="default"
            leftSection={<IconTablePlus size={16} />}
            disabled={isSubmitting}
            onClick={grid.onAdd}
          >
            Add Booking
          </Button>
        </Group>
        <DataGrid
          ref={grid.gridRef}
          containerStyle={{ height: `calc(100vh - 30.5rem)` }}
          rowData={grid.bookingRows}
          getRowId={({ data }) => data.key}
          columnDefs={grid.columnDefs}
          rowDragManaged
          animateRows
          suppressMovableColumns
          onRowDragEnd={grid.onRowDragEnd}
          defaultColDef={{
            editable: !isSubmitting,
            resizable: false,
            sortable: false,
            suppressHeaderMenuButton: true,
            cellClassRules: {
              "ag-cell-disabled": (params) => {
                if (params.node.rowPinned || !params.data) return false;
                if (params.colDef.editable === false) return false;
                return !isEditableCell(params);
              },
            },
          }}
          onCellValueChanged={grid.onCellValueChanged}
          grandTotalRow="pinnedBottom"
          context={grid.context}
        />
        <Group justify="end">
          <Group>
            <Button
              variant="subtle"
              onClick={props.onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              {props.submitLabel ?? (props.initialValues ? "Save" : "Create")}
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  );
}
