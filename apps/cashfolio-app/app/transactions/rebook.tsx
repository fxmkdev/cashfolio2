import { useState } from "react";
import type { Serialize } from "~/serialization";
import type { BookingWithTransaction } from "~/accounts/detail/types";
import {
  CancelButton,
  CreateOrSaveButton,
  FormDialog,
} from "~/platform/forms/form-dialog";
import { useAccountBook } from "~/account-books/hooks";
import type { AccountOption } from "~/types";
import {
  getAccountUnitInfo,
  getUnitInfo,
  getUnitLabel,
  isSameUnit,
} from "~/units/functions";
import type { Account } from "~/.prisma-client/client";
import { Unit } from "~/.prisma-client/enums";
import { Group, Select, Stack, Text } from "@mantine/core";

export function useRebook() {
  const [isOpen, setIsOpen] = useState(false);
  const [booking, setBooking] = useState<Serialize<BookingWithTransaction>>();
  return {
    rebookProps: {
      isOpen,
      onClose: () => setIsOpen(false),
      booking,
    },
    onRebook(booking: Serialize<BookingWithTransaction>) {
      setBooking(booking);
      setIsOpen(true);
    },
  };
}
export function Rebook({
  isOpen,
  onClose,
  booking,
  accounts,
  currentAccount,
}: {
  isOpen: boolean;
  onClose: () => void;
  booking?: Serialize<BookingWithTransaction>;
  accounts: Serialize<AccountOption>[];
  currentAccount: Serialize<Account>;
}) {
  const accountBook = useAccountBook();
  const bookingIndex = booking?.transaction.bookings.findIndex(
    (b) => b.id === booking.id,
  );

  if (!booking) return null;

  const bookingUnit = getUnitInfo(booking);

  return (
    <FormDialog
      title="Rebook to another account"
      opened={isOpen}
      size="md"
      onClose={onClose}
      entityId={booking.id}
      action={`/${accountBook.id}/transactions/update`}
    >
      <input
        type="hidden"
        name="transactionId"
        value={booking.transaction.id}
      />
      <input
        type="hidden"
        name="description"
        value={booking.transaction.description}
      />
      <Stack gap="xl">
        <Text size="sm">
          Move this booking from the current account to another account. If
          rebooking to an asset or liability account, the new account must be a{" "}
          {getUnitLabel(bookingUnit)} account.
        </Text>
        {booking.transaction.bookings.map((b, index) => (
          <>
            <input
              type="hidden"
              name={`bookings[${index}][date]`}
              value={b.date}
            />
            <input
              type="hidden"
              name={`bookings[${index}][description]`}
              value={b.description}
            />
            {index === bookingIndex ? (
              <Select
                label="New Account"
                searchable
                name={`bookings[${index}][accountId]`}
                data-autofocus
                data={accounts
                  .filter(
                    (a) =>
                      a.isActive &&
                      a.id !== currentAccount.id &&
                      (!a.unit ||
                        isSameUnit(getAccountUnitInfo(a)!, getUnitInfo(b))),
                  )
                  .map((a) => ({
                    value: a.id,
                    label: `${a.groupPath} / ${a.name}`,
                  }))}
              />
            ) : (
              <input
                type="hidden"
                name={`bookings[${index}][accountId]`}
                value={b.accountId}
              />
            )}
            <input
              type="hidden"
              name={`bookings[${index}][unit]`}
              value={b.unit}
            />
            {b.unit === Unit.CURRENCY ? (
              <input
                type="hidden"
                name={`bookings[${index}][currency]`}
                value={b.currency || ""}
              />
            ) : b.unit === Unit.CRYPTOCURRENCY ? (
              <input
                type="hidden"
                name={`bookings[${index}][cryptocurrency]`}
                value={b.cryptocurrency || ""}
              />
            ) : b.unit === Unit.SECURITY ? (
              <>
                <input
                  type="hidden"
                  name={`bookings[${index}][symbol]`}
                  value={b.symbol || ""}
                />
                <input
                  type="hidden"
                  name={`bookings[${index}][tradeCurrency]`}
                  value={b.tradeCurrency || ""}
                />
              </>
            ) : null}
            <input
              type="hidden"
              name={`bookings[${index}][value]`}
              value={b.value}
            />
          </>
        ))}
      </Stack>
      <Group justify="end">
        <CancelButton />
        <CreateOrSaveButton />
      </Group>
    </FormDialog>
  );
}
