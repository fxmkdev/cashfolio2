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
import {
  ArrowRightStartOnRectangleIcon,
  EllipsisVerticalIcon,
  ListBulletIcon,
  PencilSquareIcon,
  PlusCircleIcon,
  TrashIcon,
} from "~/platform/icons/standard";
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
  Title,
  VisuallyHidden,
} from "@mantine/core";

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
              leftSection={<PlusCircleIcon className="size-4" />}
              onClick={() => onNewTransaction()}
            >
              New Transaction
            </Button>
          )}
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon size={36} variant="default">
                <VisuallyHidden>Account Actions</VisuallyHidden>
                <EllipsisVerticalIcon className="size-4" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<PencilSquareIcon className="size-4" />}
                onClick={() => setTimeout(() => onEditAccount(account))}
              >
                Edit Account
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                leftSection={<TrashIcon className="size-4" />}
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
        className="mt-12"
        period={period}
        periodSpecifier={periodSpecifier}
        minBookingDate={minBookingDate}
        onNavigate={(newPeriodOrPeriodSpecifier) =>
          navigate(`../accounts/${account.id}/${newPeriodOrPeriodSpecifier}`)
        }
      />

      <Table
        layout="fixed"
        striped
        verticalSpacing="sm"
        className="mt-8 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]"
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th className="w-32">Date</Table.Th>
            <Table.Th>Account(s)</Table.Th>
            <Table.Th>Description</Table.Th>
            {account.type === "EQUITY" && (
              <Table.Th className="w-32 text-right">Value (FX)</Table.Th>
            )}
            <Table.Th className="w-32 text-right">Value</Table.Th>
            <Table.Th className="w-32 text-right">Balance</Table.Th>
            <Table.Th className="w-8">
              <span className="sr-only">Actions</span>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {ledgerRows.map((lr) => (
            <Table.Tr key={lr.booking.id} className="group">
              <Table.Td>{formatDate(lr.booking.date)}</Table.Td>
              <Table.Td className="truncate">
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
              </Table.Td>
              <Table.Td className="truncate">
                {isSplitTransaction(lr.booking.transaction.bookings) && (
                  <>
                    <Badge color="accent-neutral">
                      <ListBulletIcon
                        className="size-3"
                        title="Split Transaction"
                      />
                    </Badge>{" "}
                  </>
                )}
                {lr.booking.transaction.description} {lr.booking.description}
              </Table.Td>
              {account.type === "EQUITY" && (
                <Table.Td className="text-right">
                  {!isSameUnit(getUnitInfo(lr.booking), ledgerUnitInfo)
                    ? `${lr.booking.currency} ${formatMoney(lr.booking.value)}`
                    : null}
                </Table.Td>
              )}
              <Table.Td className="text-right">
                {formatMoney(lr.valueInLedgerUnit)}
              </Table.Td>
              <Table.Td className="text-right">
                {formatMoney(lr.balance)}
              </Table.Td>
              <Table.Td>
                <Menu position="bottom-end">
                  <Menu.Target>
                    <ActionIcon
                      variant="default"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100"
                    >
                      <EllipsisVerticalIcon className="size-4" />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<PencilSquareIcon className="size-4" />}
                      onClick={() =>
                        setTimeout(() =>
                          onEditTransaction(lr.booking.transaction),
                        )
                      }
                    >
                      Edit
                    </Menu.Item>
                    <Menu.Item
                      leftSection={
                        <ArrowRightStartOnRectangleIcon className="size-4" />
                      }
                      onClick={() =>
                        setTimeout(() => onMoveBooking(lr.booking))
                      }
                    >
                      Rebook
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      leftSection={<TrashIcon className="size-4" />}
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
              <Table.Td className="text-right">
                {formatMoney(openingBalance)}
              </Table.Td>
              <Table.Td />
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </>
  );
}
