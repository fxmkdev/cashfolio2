import type { AccountOption } from "~/types";
import { FormattedNumberInput } from "~/platform/forms/formatted-number-input";
import { useEffect, useState, type Dispatch } from "react";
import type { Serialize } from "~/serialization";
import type { TransactionWithBookings } from "~/transactions/types";
import {
  CancelButton,
  FormDialog,
  FormErrorMessage,
  CreateOrSaveButton,
  useFormDialogContext,
} from "~/platform/forms/form-dialog";
import { useAccountBook } from "~/account-books/hooks";
import {
  addNewBooking,
  SplitTransactionForm,
  type BookingFormValues,
} from "./split-transaction-form";
import { Unit } from "~/.prisma-client/enums";
import { formatISO } from "date-fns";
import invariant from "tiny-invariant";
import { isSplitTransaction } from "./functions";
import {
  Checkbox,
  Grid,
  Group,
  Select,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { currencies } from "~/currencies";
import { cryptocurrencies } from "~/cryptocurrencies";

export function useEditTransaction() {
  const [isOpen, setIsOpen] = useState(false);
  const [transaction, setTransaction] =
    useState<Serialize<TransactionWithBookings>>();

  return {
    editTransactionProps: {
      isOpen,
      onClose: () => setIsOpen(false),
      transaction,
    },
    onNewTransaction: () => {
      setTransaction(undefined);
      setIsOpen(true);
    },
    onEditTransaction: (transaction: Serialize<TransactionWithBookings>) => {
      setTransaction(transaction);
      setIsOpen(true);
    },
  };
}

type InputMode = "simple" | "split";

export function EditTransaction({
  isOpen,
  onClose,
  accounts,
  transaction,
  lockedAccountId,
  defaultDate,
}: {
  isOpen: boolean;
  onClose: () => void;
  accounts: AccountOption[];
  transaction?: Serialize<TransactionWithBookings>;
  lockedAccountId: string;
  defaultDate?: string;
}) {
  const accountBook = useAccountBook();
  const [createAnother, setCreateAnother] = useState(false);
  return (
    <FormDialog
      title={transaction ? "Edit Transaction" : "New Transaction"}
      size="xl"
      opened={isOpen}
      onClose={(action) => {
        if (action === "cancel" || !createAnother) {
          onClose();
        }
      }}
      action={
        transaction
          ? `/${accountBook.id}/transactions/update`
          : `/${accountBook.id}/transactions/create`
      }
      entityId={transaction?.id}
    >
      <TransactionFormGroup
        accounts={accounts.filter(
          (a) =>
            a.isActive ||
            transaction?.bookings.map((b) => b.accountId).includes(a.id),
        )}
        transaction={transaction}
        lockedAccountId={lockedAccountId}
        defaultDate={defaultDate}
        createAnother={createAnother}
        setCreateAnother={setCreateAnother}
      />
    </FormDialog>
  );
}

function TransactionFormGroup({
  accounts,
  transaction,
  lockedAccountId,
  defaultDate,
  createAnother,
  setCreateAnother,
}: {
  accounts: AccountOption[];
  transaction?: Serialize<TransactionWithBookings>;
  lockedAccountId: string;
  defaultDate?: string;
  createAnother: boolean;
  setCreateAnother: Dispatch<React.SetStateAction<boolean>>;
}) {
  const { fetcher } = useFormDialogContext();
  const [description, setDescription] = useState(
    transaction?.description ?? "",
  );
  const [bookings, setBookings] = useState<BookingFormValues[]>(
    transaction
      ? transaction.bookings
          .toSorted(
            // Ensure locked account booking is first – this is crucial for simple mode
            (a, b) =>
              (a.accountId === lockedAccountId ? 0 : 1) -
              (b.accountId === lockedAccountId ? 0 : 1),
          )
          .map((b) => ({
            ...b,
            isUnitLocked: !!accounts.find((a) => a.id === b.accountId),
            isAccountLocked: b.accountId === lockedAccountId,
            date: formatISO(b.date, { representation: "date" }),
            value: b.value.toString(),
          }))
      : addNewBooking(
          addNewBooking([], {
            lockedAccount: accounts.find((a) => a.id === lockedAccountId),
            defaultDate,
          }),
          {
            unitAccount: accounts.find((a) => a.id === lockedAccountId),
            defaultDate,
          },
        ),
  );

  const requiresSplitMode =
    !bookings.every(
      (b) =>
        (b.unit === Unit.CURRENCY && b.currency) ||
        (b.unit === Unit.CRYPTOCURRENCY && b.cryptocurrency) ||
        (b.unit === Unit.SECURITY && b.symbol),
    ) || isSplitTransaction(bookings);

  useEffect(() => {
    if (requiresSplitMode) {
      setMode("split");
    }
  }, [requiresSplitMode]);

  const [mode, setMode] = useState<InputMode>(
    requiresSplitMode ? "split" : "simple",
  );
  return (
    <>
      <input type="hidden" name="transactionId" value={transaction?.id} />
      <Stack gap="xl">
        <Switch
          checked={mode === "split"}
          onChange={(e) =>
            setMode(e.currentTarget.checked ? "split" : "simple")
          }
          disabled={requiresSplitMode}
          label="Split transaction"
        />
        {mode === "simple" ? (
          <SimpleForm
            accounts={accounts}
            lockedAccountId={lockedAccountId}
            bookings={bookings}
            description={description}
            setDescription={setDescription}
            setBookings={setBookings}
          />
        ) : (
          <SplitTransactionForm
            accounts={accounts}
            fetcher={fetcher}
            description={description}
            setDescription={setDescription}
            bookings={bookings}
            setBookings={setBookings}
          />
        )}
        <FormErrorMessage />
      </Stack>
      <Group justify="end" mt="xl">
        <Checkbox
          label="Create another"
          onChange={(e) => setCreateAnother(e.currentTarget.checked)}
          checked={createAnother}
        />
        <CancelButton />
        <CreateOrSaveButton />
      </Group>
    </>
  );
}

function SimpleForm({
  accounts,
  lockedAccountId,
  bookings,
  setBookings,
  description,
  setDescription,
}: {
  accounts: AccountOption[];
  lockedAccountId: string;
  description: string;
  setDescription: Dispatch<React.SetStateAction<string>>;
  bookings: BookingFormValues[];
  setBookings: Dispatch<React.SetStateAction<BookingFormValues[]>>;
}) {
  const { fetcher } = useFormDialogContext();

  const lockedAccount = accounts.find((a) => a.id === lockedAccountId);
  invariant(lockedAccount, "Locked account not found");

  function updateBooking(
    bookingId: string,
    updatedFields: Partial<BookingFormValues>,
  ) {
    setBookings((bookings) =>
      bookings.map((b) =>
        b.id === bookingId ? { ...b, ...updatedFields } : b,
      ),
    );
  }
  return (
    <>
      <Grid>
        <Grid.Col span={3}>
          <DateInput
            label="Date"
            name="bookings[0][date]"
            onChange={(value) =>
              updateBooking(bookings[0].id, { date: value?.toString() })
            }
            value={bookings[0].date}
            error={fetcher.data?.errors?.[`bookings[0][date]`]}
          />
          <input
            type="hidden"
            name="bookings[1][date]"
            value={bookings[1].date}
          />
        </Grid.Col>
        <Grid.Col span={9}>
          <Select
            searchable
            label="To Account"
            name="bookings[1][accountId]"
            data={accounts.map((a) => ({
              value: a.id,
              label: `${a.groupPath} / ${a.name}`,
            }))}
            value={bookings[1].accountId}
            onChange={(value) => {
              const selectedAccount = accounts.find((a) => a.id === value);
              updateBooking(bookings[1].id, {
                accountId: value ?? undefined,
                unit: selectedAccount
                  ? (selectedAccount.unit ?? lockedAccount.unit ?? undefined)
                  : undefined,
                currency: selectedAccount
                  ? (selectedAccount.currency ??
                    lockedAccount.currency ??
                    undefined)
                  : undefined,
                cryptocurrency: selectedAccount
                  ? (selectedAccount.cryptocurrency ??
                    lockedAccount.cryptocurrency ??
                    undefined)
                  : undefined,
                symbol: selectedAccount
                  ? (selectedAccount.symbol ??
                    lockedAccount.symbol ??
                    undefined)
                  : undefined,
              });
            }}
            error={fetcher.data?.errors?.[`bookings[1][accountId]`]}
          />
          <input
            type="hidden"
            name="bookings[0][accountId]"
            value={lockedAccountId}
          />
        </Grid.Col>
      </Grid>
      <Grid>
        <Grid.Col span={4}>
          <TextInput
            name="description"
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            error={fetcher.data?.errors?.description}
          />
        </Grid.Col>
        <Grid.Col span={3}>
          <Select
            label="Unit"
            disabled
            value={bookings[0].unit}
            data={[
              { value: Unit.CURRENCY, label: "Currency" },
              { value: Unit.CRYPTOCURRENCY, label: "Cryptocurrency" },
              { value: Unit.SECURITY, label: "Security" },
            ]}
          />
          <input
            type="hidden"
            name={`bookings[0][unit]`}
            value={bookings[0].unit}
          />
          <input
            type="hidden"
            name={`bookings[1][unit]`}
            value={bookings[1].unit}
          />
        </Grid.Col>
        <Grid.Col span={2}>
          {bookings[0].unit === Unit.CURRENCY ? (
            <>
              <Select
                searchable
                disabled
                label="Currency"
                value={bookings[0].currency ?? ""}
                data={Object.keys(currencies)}
              />
              <input
                type="hidden"
                name={`bookings[0][currency]`}
                value={bookings[0].currency ?? ""}
              />
              <input
                type="hidden"
                name={`bookings[1][currency]`}
                value={bookings[1].currency ?? ""}
              />
            </>
          ) : bookings[0].unit === Unit.CRYPTOCURRENCY ? (
            <>
              <Select
                label="Cryptoccy."
                value={bookings[0].cryptocurrency ?? ""}
                disabled={true}
                data={Object.keys(cryptocurrencies)}
              />
              <input
                type="hidden"
                name={`bookings[0][cryptocurrency]`}
                value={bookings[0].cryptocurrency ?? ""}
              />
              <input
                type="hidden"
                name={`bookings[1][cryptocurrency]`}
                value={bookings[1].cryptocurrency ?? ""}
              />
            </>
          ) : (
            <>
              <TextInput
                label="Symbol"
                value={bookings[0].symbol ?? ""}
                disabled={true}
              />
              <input
                type="hidden"
                name={`bookings[0][symbol]`}
                value={bookings[0].symbol ?? ""}
              />
              <input
                type="hidden"
                name={`bookings[1][symbol]`}
                value={bookings[1].symbol ?? ""}
              />
            </>
          )}
        </Grid.Col>
        <Grid.Col span={3}>
          <FormattedNumberInput
            label="Value"
            value={bookings[1].value}
            onValueChange={({ floatValue }) => {
              updateBooking(bookings[0].id, {
                value:
                  floatValue != null ? (-floatValue).toString() : undefined,
              });
              updateBooking(bookings[1].id, { value: floatValue?.toString() });
            }}
            name="bookings[1][value]"
            hideControls
            error={fetcher.data?.errors?.[`bookings[1][value]`]}
          />
          <input
            type="hidden"
            name="bookings[0][value]"
            value={bookings[0].value}
          />
        </Grid.Col>
      </Grid>
    </>
  );
}
