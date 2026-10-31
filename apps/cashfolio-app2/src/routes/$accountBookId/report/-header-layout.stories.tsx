import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AccountBookShell } from "../-account-book-shell";
import { ReportPageView, type ReportPageViewProps } from "./-page-view";
import {
  baseOverview,
  clearReportStorySessionStorage,
  deriveOverviewFromSelectedPeriodValue,
  STORYBOOK_ACCOUNT_BOOK_ID,
} from "./-page-view.story-fixtures";
import { buildNetWorthReconciliationModel } from "./-net-worth/-net-worth-reconciliation";

function ReportInAccountBookShell(props: ReportPageViewProps) {
  const [period, setPeriod] = useState(props.selectedPeriodValue);
  return (
    <AccountBookShell
      accountBookId={STORYBOOK_ACCOUNT_BOOK_ID}
      accountBooks={[{ id: STORYBOOK_ACCOUNT_BOOK_ID, name: "Storybook Book" }]}
      userSecurityUrl={null}
      canAccessAdmin={false}
      currentHref={`/${STORYBOOK_ACCOUNT_BOOK_ID}/report`}
      pathname={`/${STORYBOOK_ACCOUNT_BOOK_ID}/report`}
      appVersion="storybook"
      userProfile={{
        displayName: "Storybook User",
        avatarUrl: null,
        initials: "SU",
      }}
      accountsLinkSearch={{ tab: "BALANCE", mode: "active" }}
      periodLinkSearch={{ period }}
    >
      <ReportPageView
        {...props}
        overview={deriveOverviewFromSelectedPeriodValue(period)}
        selectedPeriodValue={period}
        onPeriodChange={(nextPeriod) => {
          setPeriod(nextPeriod);
          props.onPeriodChange(nextPeriod);
        }}
      />
    </AccountBookShell>
  );
}

const meta = {
  title: "Routes/ReportHeaderLayout",
  component: ReportPageView,
  render: (args) => <ReportInAccountBookShell {...args} />,
  loaders: [
    () => {
      clearReportStorySessionStorage(STORYBOOK_ACCOUNT_BOOK_ID);
      return {};
    },
  ],
  parameters: {
    router: { initialPath: `/${STORYBOOK_ACCOUNT_BOOK_ID}/report` },
    colorScheme: "light",
  },
  args: {
    accountBookId: STORYBOOK_ACCOUNT_BOOK_ID,
    overview: baseOverview,
    selectedPeriodValue: baseOverview.selectedPeriodValue,
    netWorthReconciliation: buildNetWorthReconciliationModel({
      baselineNetWorth: 230_000,
      baselineSource: "previous-period",
      currentNetWorth: 245_000,
      totalReturn: baseOverview.stats.totalReturn,
    }),
    onPeriodChange: fn(),
    onBreakdownAccountDoubleClick: fn(),
    onGainLossUnitAccountDoubleClick: fn(),
  },
} satisfies Meta<typeof ReportPageView>;
export default meta;
type Story = StoryObj<typeof meta>;

const checkLayout: NonNullable<Story["play"]> = async ({
  canvasElement,
  args,
}) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  const grouping = await canvas.findByRole("combobox", {
    name: "Group Accounts By",
  });
  const label = canvas.getByText("Group Accounts By", { exact: true });
  const heading = canvas.getByRole("heading", { name: "February 2026" });
  const shell = heading.closest<HTMLElement>(".cf-page-shell")!;
  const header = shell.firstElementChild as HTMLElement;
  const main = canvas.getByRole("main");
  const warning = canvas.getByTestId("period-net-worth-reconciliation-warning");
  const picker = canvas.getByTestId("period-picker-trigger");
  const previous = canvas.getByRole("button", { name: "Previous Period" });
  const next = canvas.getByRole("button", { name: "Next Period" });

  const assertLayout = async () => {
    await waitFor(() => {
      const headerRect = header.getBoundingClientRect();
      for (const control of [label, grouping, previous, picker, next]) {
        const rect = control.getBoundingClientRect();
        expect(rect.top).toBeGreaterThanOrEqual(headerRect.top - 1);
        expect(rect.bottom).toBeLessThanOrEqual(headerRect.bottom + 1);
      }
      expect(
        warning.getBoundingClientRect().top - headerRect.bottom,
      ).toBeGreaterThanOrEqual(16);
      expect(shell.scrollHeight).toBeGreaterThan(main.clientHeight);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
        window.innerWidth,
      );
      if (window.innerWidth < 768) {
        expect(
          previous.getBoundingClientRect().top -
            grouping.getBoundingClientRect().bottom,
        ).toBeGreaterThanOrEqual(8);
        expect(grouping.getBoundingClientRect().width).toBeCloseTo(
          shell.getBoundingClientRect().width,
          0,
        );
      } else {
        expect(grouping.getBoundingClientRect().width).toBeCloseTo(208, 0);
        expect(grouping.getBoundingClientRect().bottom).toBeCloseTo(
          picker.getBoundingClientRect().bottom,
          0,
        );
        expect(grouping.getBoundingClientRect().right).toBeLessThan(
          previous.getBoundingClientRect().left,
        );
      }
    });
  };

  await assertLayout();
  for (const value of ["Asset Class", "Account Structure"]) {
    await userEvent.click(grouping);
    await userEvent.click(body.getByRole("option", { name: value }));
    await expect(grouping).toHaveValue(value);
    await assertLayout();
  }
  await userEvent.click(picker);
  await waitFor(() =>
    expect(body.getByTestId("period-month-picker")).toBeVisible(),
  );
  await userEvent.click(picker);
  await waitFor(() =>
    expect(body.queryByTestId("period-month-picker")).not.toBeInTheDocument(),
  );
  await userEvent.click(next);
  await expect(
    await canvas.findByRole("heading", { name: "March 2026" }),
  ).toBeVisible();
  await expect(args.onPeriodChange).toHaveBeenCalledWith("2026-03");
  await expect(grouping).toHaveValue("Account Structure");
  await assertLayout();
};

export const Desktop: Story = { play: checkLayout };
export const ShortDesktop: Story = {
  parameters: {
    viewport: {
      defaultViewport: "cashfolioShortDesktop",
      options: {
        cashfolioShortDesktop: {
          name: "Cashfolio short desktop",
          styles: { width: "1280px", height: "600px" },
        },
      },
    },
  },
  play: checkLayout,
};
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: "cashfolioMobile" } },
  play: checkLayout,
};
