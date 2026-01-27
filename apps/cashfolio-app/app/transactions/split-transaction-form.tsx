import { createId } from "@paralleldrive/cuid2";
import { type Dispatch } from "react";
import type { FetcherWithComponents, useFetcher } from "react-router";
import { Unit } from "~/.prisma-client/enums";
import type { FetcherData } from "~/platform/forms/form-dialog";
import { FormattedNumberInput } from "~/platform/forms/formatted-number-input";
import type { Serialize } from "~/serialization";
import type { AccountOption } from "~/types";
import type { action } from "./actions/create";
import { PlusIcon, TrashIcon } from "~/platform/icons/standard";
import type { Booking } from "~/.prisma-client/client";
import {
  ActionIcon,
  Button,
  Divider,
  Flex,
  Grid,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { currencies } from "~/currencies";
import { cryptocurrencies } from "~/cryptocurrencies";

export function SplitTransactionForm({
  accounts,
  fetcher,
  bookings,
  setBookings,
  description,
  setDescription,
}: {
  accounts: AccountOption[];
  fetcher: FetcherWithComponents<FetcherData>;
  description: string;
  setDescription: Dispatch<React.SetStateAction<string>>;
  bookings: BookingFormValues[];
  setBookings: Dispatch<React.SetStateAction<BookingFormValues[]>>;
}) {
  return (
    <>
      <Grid>
        <Grid.Col span={12}>
          <TextInput
            label="Description (optional)"
            name="description"
            error={fetcher.data?.errors?.description}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Grid.Col>
      </Grid>
      <BookingsTable
        bookings={bookings}
        setBookings={setBookings}
        accounts={accounts}
        data={fetcher.data}
      />
    </>
  );
}

function BookingsTable({
  accounts,
  data,
  bookings,
  setBookings,
}: {
  accounts: AccountOption[];
  data: ReturnType<typeof useFetcher<typeof action>>["data"];
  bookings: BookingFormValues[];
  setBookings: Dispatch<React.SetStateAction<BookingFormValues[]>>;
}) {
  return (
    <>
      {bookings.map((booking, i) => {
        const selectedAccount = accounts.find(
          (a) => a.id === booking.accountId,
        );

        function updateBooking(updatedFields: Partial<BookingFormValues>) {
          setBookings((bookings) =>
            bookings.map((b) =>
              b.id === booking.id ? { ...b, ...updatedFields } : b,
            ),
          );
        }

        function deleteBooking() {
          setBookings((bookings) =>
            bookings.filter((b) => b.id !== booking.id),
          );
        }

        function fieldName(bookingProperty: keyof BookingFormValues) {
          return `bookings[${i}][${bookingProperty}]`;
        }

        function fieldError(bookingProperty: keyof BookingFormValues) {
          return data?.errors?.[fieldName(bookingProperty)];
        }

        return (
          <>
            <Group gap="sm" wrap="nowrap">
              <Flex align="center" justify="center" w="5rem">
                <Text c="dimmed" size="sm">
                  #{i + 1}
                </Text>
              </Flex>
              <Stack gap="xl">
                <Grid columns={24}>
                  <Grid.Col span={7}>
                    <DateInput
                      label="Date"
                      name={fieldName("date")}
                      value={booking.date}
                      onChange={(d) =>
                        updateBooking({ date: d ? d.toString() : "" })
                      }
                      error={fieldError("date")}
                    />
                  </Grid.Col>
                  <Grid.Col span={17}>
                    <Select
                      searchable
                      label="Account"
                      disabled={booking.isAccountLocked}
                      name={fieldName("accountId")}
                      value={booking.accountId}
                      onChange={(accountId) => {
                        const newAccount = accounts.find(
                          (a) => a.id === accountId,
                        );
                        updateBooking({
                          accountId: accountId ?? "",
                          unit: newAccount?.unit ?? Unit.CURRENCY,
                          currency: newAccount?.currency ?? "",
                          cryptocurrency: newAccount?.cryptocurrency ?? "",
                          symbol: newAccount?.symbol ?? "",
                        });
                      }}
                      error={fieldError("accountId")}
                      data={accounts.map((a) => ({
                        value: a.id,
                        label: `${a.groupPath} (${a.name})`,
                      }))}
                    />
                    {booking.isAccountLocked && (
                      <input
                        type="hidden"
                        name={fieldName("accountId")}
                        value={booking.accountId}
                      />
                    )}
                  </Grid.Col>
                </Grid>
                <Grid columns={24}>
                  <Grid.Col span={6}>
                    <TextInput
                      label="Description (opt.)"
                      name={fieldName("description")}
                      type="text"
                      value={booking.description}
                      onChange={(e) =>
                        updateBooking({ description: e.target.value })
                      }
                      error={fieldError("description")}
                    />
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <Select
                      label="Unit"
                      disabled={!!selectedAccount?.unit}
                      name={fieldName("unit")}
                      value={booking.unit}
                      onChange={(unit) => {
                        updateBooking({
                          unit: unit as Unit,
                          currency: "",
                          cryptocurrency: "",
                          symbol: "",
                        });
                      }}
                      data={[
                        { value: Unit.CURRENCY, label: "Currency" },
                        { value: Unit.CRYPTOCURRENCY, label: "Cryptocurrency" },
                        { value: Unit.SECURITY, label: "Security" },
                      ]}
                      error={fieldError("unit")}
                    />
                    {!!selectedAccount?.unit && (
                      <input
                        type="hidden"
                        name={fieldName("unit")}
                        value={selectedAccount.unit}
                      />
                    )}
                  </Grid.Col>
                  {booking.unit === Unit.CURRENCY ? (
                    <Grid.Col span={7}>
                      <Select
                        label="Currency"
                        searchable
                        name={fieldName("currency")}
                        value={booking.currency ?? ""}
                        onChange={(currency) => updateBooking({ currency })}
                        disabled={!!selectedAccount?.currency}
                        data={Object.keys(currencies)}
                        error={fieldError("currency")}
                      />
                      {!!selectedAccount?.currency && (
                        <input
                          type="hidden"
                          name={fieldName("currency")}
                          value={booking.currency ?? ""}
                        />
                      )}
                    </Grid.Col>
                  ) : booking.unit === Unit.CRYPTOCURRENCY ? (
                    <Grid.Col span={7}>
                      <Select
                        searchable
                        label="Cryptocurrency"
                        name={fieldName("cryptocurrency")}
                        value={booking.cryptocurrency ?? ""}
                        onChange={(cryptocurrency) =>
                          updateBooking({ cryptocurrency })
                        }
                        disabled={!!selectedAccount?.cryptocurrency}
                        data={Object.keys(cryptocurrencies)}
                        error={fieldError("cryptocurrency")}
                      />
                      {!!selectedAccount?.cryptocurrency && (
                        <input
                          type="hidden"
                          name={fieldName("cryptocurrency")}
                          value={booking.cryptocurrency ?? ""}
                        />
                      )}
                    </Grid.Col>
                  ) : booking.unit === Unit.SECURITY ? (
                    <>
                      <Grid.Col span={4}>
                        <TextInput
                          label="Symbol"
                          name={fieldName("symbol")}
                          value={booking.symbol ?? ""}
                          onChange={(e) =>
                            updateBooking({ symbol: e.target.value })
                          }
                          disabled={!!selectedAccount?.symbol}
                          error={fieldError("symbol")}
                        />
                        {!!selectedAccount?.symbol && (
                          <input
                            type="hidden"
                            name={fieldName("symbol")}
                            value={booking.symbol ?? ""}
                          />
                        )}
                      </Grid.Col>
                      <Grid.Col span={3}>
                        <TextInput
                          label="Trade Ccy."
                          name={fieldName("tradeCurrency")}
                          value={booking.tradeCurrency ?? ""}
                          onChange={(e) =>
                            updateBooking({ tradeCurrency: e.target.value })
                          }
                          error={fieldError("tradeCurrency")}
                          disabled={!!selectedAccount?.tradeCurrency}
                        />
                        {!!selectedAccount?.tradeCurrency && (
                          <input
                            type="hidden"
                            name={fieldName("tradeCurrency")}
                            value={booking.tradeCurrency ?? ""}
                          />
                        )}
                      </Grid.Col>
                    </>
                  ) : null}
                  <Grid.Col span={5}>
                    <FormattedNumberInput
                      label="Value"
                      placeholder="Value"
                      name={fieldName("value")}
                      value={booking.value}
                      onValueChange={({ value }) => updateBooking({ value })}
                      hideControls
                      error={fieldError("value")}
                    />
                  </Grid.Col>
                </Grid>
              </Stack>
              <Flex align="center" justify="center" w="5rem">
                <ActionIcon
                  disabled={bookings.length <= 2 || booking.isAccountLocked}
                  onClick={() => deleteBooking()}
                  variant="subtle"
                  color="red"
                >
                  <TrashIcon className="size-4" />
                </ActionIcon>
              </Flex>
            </Group>
            <Divider />
          </>
        );
      })}

      <Group justify="center">
        <Button
          type="button"
          variant="default"
          leftSection={<PlusIcon className="size-4" />}
          onClick={() => setBookings(addNewBooking(bookings))}
        >
          Add booking
        </Button>
      </Group>
    </>
  );
}

export function addNewBooking(
  bookings: BookingFormValues[],
  {
    lockedAccount,
    unitAccount,
    defaultDate,
  }: {
    lockedAccount?: AccountOption;
    unitAccount?: AccountOption;
    defaultDate?: string;
  } = {},
) {
  return [
    ...bookings,
    {
      id: createId(),
      date: bookings[bookings.length - 1]?.date ?? defaultDate,
      description: "",
      accountId: lockedAccount?.id ?? "",
      isAccountLocked: !!lockedAccount || undefined,
      unit: lockedAccount?.unit ?? unitAccount?.unit ?? Unit.CURRENCY,
      currency: lockedAccount?.currency ?? unitAccount?.currency ?? "",
      cryptocurrency:
        lockedAccount?.cryptocurrency ?? unitAccount?.cryptocurrency ?? "",
      symbol: lockedAccount?.symbol ?? unitAccount?.symbol ?? "",
      value: "",
    } as BookingFormValues,
  ];
}

export type BookingFormValues = Serialize<
  Pick<
    Booking,
    | "id"
    | "date"
    | "description"
    | "accountId"
    | "currency"
    | "cryptocurrency"
    | "symbol"
    | "tradeCurrency"
    | "unit"
  >
> & { value: string; isAccountLocked: boolean; isUnitLocked: boolean };
