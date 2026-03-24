import { Container, Group, Stack, Title } from "@mantine/core";
import { IconListDetails } from "@tabler/icons-react";
import { useMemo } from "react";
import { ensureChartModulesRegistered } from "../../ag-chart-modules";
import { LinkButton } from "../../components/link-button";
import type { getDashboardIncomeExpenseOverview } from "../../server/dashboard";
import type { DashboardPeriod } from "./-dashboard-page-types";
import { DashboardAssetAllocationCard } from "./-dashboard-asset-allocation-card";
import { DashboardIncomeExpenseCard } from "./-dashboard-income-expense-card";

ensureChartModulesRegistered();

export type DashboardPageViewProps = {
  accountBookId: string;
  overview: Awaited<ReturnType<typeof getDashboardIncomeExpenseOverview>>;
  selectedPeriod: DashboardPeriod;
  onPeriodChange: (period: DashboardPeriod) => void;
};

export function DashboardPageView({
  accountBookId,
  overview,
  selectedPeriod,
  onPeriodChange,
}: DashboardPageViewProps) {
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        style: "currency",
        currency: overview.referenceCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [overview.referenceCurrency],
  );
  const compactNumberFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        notation: "compact",
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }),
    [],
  );
  const percentageFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [],
  );

  return (
    <Container fluid py="xl" px="xl">
      <Group mb="lg" justify="space-between" align="center" mih={36}>
        <Title order={2}>Dashboard</Title>
        <LinkButton
          variant="default"
          leftSection={<IconListDetails size={16} />}
          to="/$accountBookId/accounts"
          params={{ accountBookId }}
          search={{ tab: "ASSET", mode: "active" }}
        >
          Accounts
        </LinkButton>
      </Group>

      <Stack gap="lg">
        <DashboardIncomeExpenseCard
          overview={overview}
          selectedPeriod={selectedPeriod}
          onPeriodChange={onPeriodChange}
          currencyFormatter={currencyFormatter}
          compactNumberFormatter={compactNumberFormatter}
        />
        <DashboardAssetAllocationCard
          assetAllocation={overview.assetAllocation}
          currencyFormatter={currencyFormatter}
          percentageFormatter={percentageFormatter}
        />
      </Stack>
    </Container>
  );
}
