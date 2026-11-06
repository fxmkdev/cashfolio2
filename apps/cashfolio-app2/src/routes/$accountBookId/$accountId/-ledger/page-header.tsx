import { Badge, Box, Button, Group, Text, Title, Tooltip } from "@mantine/core";
import { IconBolt } from "@tabler/icons-react";
import { AccountType } from "@/.prisma-client/enums";
import { useAssetClasses } from "@/classification-context";
import { TopPageHeader } from "@/components/layout/top-page-header";
import { getAssetClassLabel } from "@/shared/asset-class";
import {
  LedgerAccountActions,
  type LedgerAccountActionsProps,
} from "./account-actions";
import { getLedgerAccountKindBadgeProps } from "./page-data";
import type { LedgerPageViewProps } from "./page-view.types";
import classes from "./page-header.module.css";
import { LedgerAccountSwitcher } from "./account-switcher";

export type LedgerPageHeaderProps = LedgerAccountActionsProps &
  Pick<
    LedgerPageViewProps,
    | "unitLabel"
    | "accountSwitcher"
    | "periodFilterControls"
    | "simpleTransactionDisabledReason"
    | "onAddTransactionClick"
  >;

function LedgerMetadata({ account }: Pick<LedgerPageHeaderProps, "account">) {
  const assetClassLabel = getAssetClassLabel(
    account.assetClassId,
    useAssetClasses(),
  );
  if (account.type !== AccountType.BALANCE) return null;
  const accountGroupLabel =
    account.groupPathSegments.join(" / ") || "Top Level";
  return (
    <Text size="sm" c="dimmed" data-testid="ledger-header-metadata">
      <span>Account Group: {accountGroupLabel}</span>
      <span aria-hidden="true">{"\u00a0·"}</span>{" "}
      <span title={`Asset Class: ${assetClassLabel}`}>
        Asset Class: {assetClassLabel}
      </span>
    </Text>
  );
}

function LedgerBadges({
  account,
  unitLabel,
}: Pick<LedgerPageHeaderProps, "account" | "unitLabel">) {
  const badge = getLedgerAccountKindBadgeProps(account);
  return (
    <>
      <Badge size="lg" color={badge.color} variant={badge.variant}>
        {badge.label}
      </Badge>
      {unitLabel ? (
        <Badge size="lg" color="gray">
          {unitLabel}
        </Badge>
      ) : null}
      {!account.isActive ? (
        <Badge size="lg" color="gray">
          Archived
        </Badge>
      ) : null}
    </>
  );
}

function LedgerToolbar(props: LedgerPageHeaderProps) {
  return (
    <Group
      gap="sm"
      justify="space-between"
      wrap="nowrap"
      className={classes.toolbar}
      role="group"
      aria-label="Ledger Controls"
    >
      {props.periodFilterControls && (
        <Box className={classes.period}>{props.periodFilterControls}</Box>
      )}
      <Group gap="sm" wrap="nowrap" ml="auto" className={classes.commands}>
        <LedgerAccountActions {...props} />
        <Tooltip
          label={
            props.simpleTransactionDisabledReason
              ? `${props.simpleTransactionDisabledReason} Split editor will open instead.`
              : "Quick two-booking entry"
          }
        >
          <span className={classes.action}>
            <Button
              leftSection={<IconBolt size={16} />}
              onClick={props.onAddTransactionClick}
            >
              Add Transaction
            </Button>
          </span>
        </Tooltip>
      </Group>
    </Group>
  );
}

export function LedgerPageHeader(props: LedgerPageHeaderProps) {
  return (
    <TopPageHeader
      layout="responsive"
      heading={
        props.account.type === AccountType.BALANCE && props.accountSwitcher ? (
          <LedgerAccountSwitcher
            key={props.account.id}
            account={props.account}
            {...props.accountSwitcher}
          />
        ) : (
          <Title order={2}>{props.account.name}</Title>
        )
      }
      description={
        props.account.type === AccountType.BALANCE ? (
          <LedgerMetadata account={props.account} />
        ) : undefined
      }
      headingAccessory={
        <LedgerBadges account={props.account} unitLabel={props.unitLabel} />
      }
      actions={<LedgerToolbar {...props} />}
    />
  );
}
