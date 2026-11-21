import type { Meta, StoryObj } from "@storybook/react-vite";
import { LedgerPageView } from "./page-view";
import { LedgerPageStoryHarness } from "./page-view.story-harness";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import { defaultAssetClassIds } from "@/shared/classification/asset-class";
import { ledgerPageStoryMeta } from "./page-view.story-meta";

const meta: Meta<typeof LedgerPageView> = {
  ...ledgerPageStoryMeta,
  title: "Screens/Ledger/Overview",
};
export default meta;
type Story = StoryObj<typeof meta>;

export const HappyPath: Story = {
  render: () => <LedgerPageStoryHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("heading", { name: "Checking" }),
    ).toBeVisible();
    await expect(canvas.getByText("Account", { exact: true })).toBeVisible();
    await expect(canvas.getByText("CHF")).toBeVisible();
    await expect(
      canvas.getByTitle("Asset Class: Unclassified"),
    ).toHaveTextContent("Asset Class: Unclassified");
    const metadata = canvas.getByTestId("ledger-header-metadata");
    await expect(metadata).toHaveTextContent(
      "Account Group: Assets / Cash · Asset Class: Unclassified",
    );
    await expect(metadata.textContent?.match(/·/g)).toEqual(["·"]);
    await expect(
      canvas.queryByRole("link", { name: "Accounts" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("link", { name: "Archive" }),
    ).not.toBeInTheDocument();
  },
};

export const ClassifiedAsset: Story = {
  render: () => (
    <LedgerPageStoryHarness
      assetClassId={defaultAssetClassIds.COMMODITIES_AND_PRECIOUS_METALS}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTitle(
        "Asset Class: Commodities & Precious Metals",
      ),
    ).toHaveTextContent("Asset Class: Commodities & Precious Metals");
  },
};

export const TopLevelAccount: Story = {
  render: () => <LedgerPageStoryHarness groupPathSegments={[]} />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId("ledger-header-metadata"),
    ).toHaveTextContent("Account Group: Top Level · Asset Class: Unclassified");
  },
};

export const UnclassifiedLiability: Story = {
  render: () => <LedgerPageStoryHarness accountType={AccountType.BALANCE} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Account", { exact: true })).toBeVisible();
    await expect(
      canvas.getByTitle("Asset Class: Unclassified"),
    ).toHaveTextContent("Asset Class: Unclassified");
  },
};

export const ArchivedClassifiedLiability: Story = {
  render: () => (
    <LedgerPageStoryHarness
      accountType={AccountType.BALANCE}
      accountActive={false}
      assetClassId={defaultAssetClassIds.FIXED_INCOME}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Archived", { exact: true })).toBeVisible();
    await expect(
      canvas.getByTitle("Asset Class: Fixed Income"),
    ).toHaveTextContent("Asset Class: Fixed Income");
    await expect(
      canvas.getByTestId("ledger-header-metadata"),
    ).toHaveTextContent(
      "Account Group: Assets / Cash · Asset Class: Fixed Income",
    );
  },
};

export const EquityWithoutAssetClass: Story = {
  render: () => <LedgerPageStoryHarness accountType={AccountType.EQUITY} />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByTitle(/^Asset Class:/),
    ).not.toBeInTheDocument();
    await expect(
      within(canvasElement).queryByTestId("ledger-header-metadata"),
    ).not.toBeInTheDocument();
  },
};

export const SimpleModalState: Story = {
  render: () => <LedgerPageStoryHarness startWithSimpleModal={true} />,
};

export const SplitModalState: Story = {
  render: () => <LedgerPageStoryHarness startWithSplitModal={true} />,
};

export const EditModalState: Story = {
  render: () => <LedgerPageStoryHarness startWithEditModal={true} />,
};

export const ExpenseCategoryContextView: Story = {
  render: () => (
    <LedgerPageStoryHarness
      accountType={AccountType.EQUITY}
      equitySubtype={EquityAccountSubtype.EXPENSE}
      returnLabel="Report"
    />
  ),
  name: "Expense Category Context Playground",
  tags: ["!regression"],
  play: undefined,
};

export const ExpenseCategoryContext: Story = {
  ...ExpenseCategoryContextView,
  name: "Expense Category Context Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Expense Category", { exact: true }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to Report" }),
    ).toHaveAttribute("href", "/storybook-book/report?period=2026-01");
    await userEvent.click(
      canvas.getByRole("button", { name: "Category Actions" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: "Manage Category" }),
      ).toBeVisible(),
    );
  },
};

export const IncomeCategoryMobile: Story = {
  globals: { viewport: { value: "cashfolioMobile", isRotated: false } },
  render: () => (
    <LedgerPageStoryHarness
      accountType={AccountType.EQUITY}
      equitySubtype={EquityAccountSubtype.INCOME}
      returnLabel="Checking"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Income Category", { exact: true }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to Checking" }),
    ).toBeVisible();
  },
};

export const OpeningBalancesDirectVisitView: Story = {
  render: () => (
    <LedgerPageStoryHarness
      accountType={AccountType.EQUITY}
      equitySubtype={EquityAccountSubtype.OPENING_BALANCES}
      accountActionsDisabled
    />
  ),
  name: "Opening Balances Direct Visit Playground",
  tags: ["!regression"],
  play: undefined,
};

export const OpeningBalancesDirectVisit: Story = {
  ...OpeningBalancesDirectVisitView,
  name: "Opening Balances Direct Visit Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("System Account", { exact: true }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: /^Back to/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Account Actions" }),
    );
    await screen.findByRole("menuitem", { name: "Archive" });
    await expect(
      screen.queryByRole("menuitem", { name: "Manage Category" }),
    ).not.toBeInTheDocument();
  },
};

export const GainLossContextView: Story = {
  render: () => (
    <LedgerPageStoryHarness
      accountType={AccountType.EQUITY}
      equitySubtype={EquityAccountSubtype.GAIN_LOSS}
      returnLabel="History"
      accountActionsDisabled
    />
  ),
  name: "Gain Loss Context Playground",
  tags: ["!regression"],
  play: undefined,
};

export const GainLossContext: Story = {
  ...GainLossContextView,
  name: "Gain Loss Context Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("System-Managed Category", { exact: true }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to History" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Category Actions" }),
    );
    await expect(
      screen.queryByRole("menuitem", { name: "Manage Category" }),
    ).not.toBeInTheDocument();
  },
};
