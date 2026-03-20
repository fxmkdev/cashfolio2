import {
  EditTransaction,
  useEditTransaction,
} from "~/transactions/edit-transaction";
import type { LoaderData } from "./route";
import {
  DeleteTransaction,
  useDeleteTransaction,
} from "~/transactions/delete-transaction";
import { formatDate, formatISODate, formatMoney } from "~/formatting";
import { Fragment } from "react/jsx-runtime";
import { useAccountBook } from "~/account-books/hooks";
import { EditAccount, useEditAccount } from "../edit-account";
import { DeleteAccount, useDeleteAccount } from "../delete-account";
import { getUnitInfo, getUnitLabel, isSameUnit } from "~/units/functions";
import { Rebook, useRebook } from "~/transactions/rebook";
import { PeriodSelector } from "~/period/period-selector";
import { useNavigate } from "react-router";
import { parseISO } from "date-fns";
import { isSplitTransaction } from "~/transactions/functions";
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Group,
  Menu,
  Table,
  Text,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import {
  IconDotsVertical,
  IconList,
  IconPencil,
  IconPlus,
  IconSquareArrowRight,
  IconTrash,
} from "@tabler/icons-react";

export function Page({
  loaderData: {
    account,
    allAccounts,
    ledgerUnitInfo,
    openingBalance,
    ledgerRows,
    accountGroups,
    period,
    periodSpecifier,
    minBookingDate,
  },
}: {
  loaderData: LoaderData;
}) {
  const { editAccountProps, onEditAccount } = useEditAccount();
  const { deleteAccountProps, onDeleteAccount } = useDeleteAccount();

  const { editTransactionProps, onNewTransaction, onEditTransaction } =
    useEditTransaction();

  const { deleteTransactionProps, onDeleteTransaction } =
    useDeleteTransaction();

  const { rebookProps: moveBookingProps, onRebook: onMoveBooking } =
    useRebook();

  const accountBook = useAccountBook();
  const navigate = useNavigate();

  return (
    <>
      <Group gap="sm" align="center" justify="space-between">
        <Group align="center" gap="sm">
          <Title order={2} size="h3">
            {account.groupPath} / {account.name}
          </Title>
          <Badge>{getUnitLabel(ledgerUnitInfo)}</Badge>
          {!account.isActive && <Badge color="red">Inactive</Badge>}
        </Group>

        <EditAccount {...editAccountProps} accountGroups={accountGroups} />
        <DeleteAccount {...deleteAccountProps} />

        <Group gap="sm" align="center">
          {account.isActive && (
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => onNewTransaction()}
            >
              New Transaction
            </Button>
          )}
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon size={36} variant="default">
                <VisuallyHidden>Account Actions</VisuallyHidden>
                <IconDotsVertical size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconPencil size={16} />}
                onClick={() => setTimeout(() => onEditAccount(account))}
              >
                Edit Account
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconTrash size={16} />}
                color="red"
                onClick={(e) => {
                  setTimeout(() => onDeleteAccount(account.id));
                }}
              >
                Delete Account
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <EditTransaction
        {...editTransactionProps}
        accounts={allAccounts}
        lockedAccountId={account.id}
        defaultDate={
          ledgerRows[0]?.booking.date
            ? formatISODate(parseISO(ledgerRows[0].booking.date))
            : undefined
        }
      />
      <DeleteTransaction {...deleteTransactionProps} />
      <Rebook
        {...moveBookingProps}
        accounts={allAccounts}
        currentAccount={account}
      />

      <PeriodSelector
        period={period}
        periodSpecifier={periodSpecifier}
        minBookingDate={minBookingDate}
        onNavigate={(newPeriodOrPeriodSpecifier) =>
          navigate(`../accounts/${account.id}/${newPeriodOrPeriodSpecifier}`)
        }
      />

      <Table layout="fixed" striped verticalSpacing="sm" mt="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Date</Table.Th>
            <Table.Th>Account(s)</Table.Th>
            <Table.Th>Description</Table.Th>
            {account.type === "EQUITY" && (
              <Table.Th align="right">Value (FX)</Table.Th>
            )}
            <Table.Th align="right">Value</Table.Th>
            <Table.Th align="right">Balance</Table.Th>
            <Table.Th>
              <VisuallyHidden>Actions</VisuallyHidden>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {ledgerRows.map((lr) => (
            <Table.Tr key={lr.booking.id}>
              <Table.Td>{formatDate(lr.booking.date)}</Table.Td>
              <Table.Td>
                <Text truncate="end">
                  {Array.from(
                    new Set(
                      lr.booking.transaction.bookings
                        .map((b) => b.accountId)
                        .filter((accountId) => accountId !== account.id),
                    ),
                  ).map((accountId, i, arr) => (
                    <Fragment key={accountId}>
                      <Anchor
                        size="sm"
                        href={`/${accountBook.id}/accounts/${accountId}`}
                      >
                        {allAccounts.find((a) => a.id === accountId)?.name}
                      </Anchor>
                      {i < arr.length - 1 ? ", " : null}
                    </Fragment>
                  ))}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text truncate="end">
                  {isSplitTransaction(lr.booking.transaction.bookings) && (
                    <>
                      <Badge color="accent-neutral">
                        <IconList size={16} title="Split Transaction" />
                      </Badge>{" "}
                    </>
                  )}
                  {lr.booking.transaction.description} {lr.booking.description}
                </Text>
              </Table.Td>
              {account.type === "EQUITY" && (
                <Table.Td align="right">
                  {!isSameUnit(getUnitInfo(lr.booking), ledgerUnitInfo)
                    ? `${lr.booking.currency} ${formatMoney(lr.booking.value)}`
                    : null}
                </Table.Td>
              )}
              <Table.Td align="right">
                {formatMoney(lr.valueInLedgerUnit)}
              </Table.Td>
              <Table.Td align="right">{formatMoney(lr.balance)}</Table.Td>
              <Table.Td>
                <Menu position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="default" size="sm">
                      <IconDotsVertical size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconPencil size={16} />}
                      onClick={() =>
                        setTimeout(() =>
                          onEditTransaction(lr.booking.transaction),
                        )
                      }
                    >
                      Edit
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconSquareArrowRight size={16} />}
                      onClick={() =>
                        setTimeout(() => onMoveBooking(lr.booking))
                      }
                    >
                      Rebook
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      leftSection={<IconTrash size={16} />}
                      color="red"
                      onClick={() =>
                        setTimeout(() =>
                          onDeleteTransaction(lr.booking.transactionId),
                        )
                      }
                    >
                      Delete
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Table.Td>
            </Table.Tr>
          ))}
          {openingBalance != null && (
            <Table.Tr>
              <Table.Td />
              <Table.Td />
              <Table.Td colSpan={2}>
                <em>Opening balance</em>
              </Table.Td>
              <Table.Td align="right">{formatMoney(openingBalance)}</Table.Td>
              <Table.Td />
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </>
  );
}
