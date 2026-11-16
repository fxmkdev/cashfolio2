import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Text } from "@mantine/core";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import { defaultAssetClassIds } from "@/shared/classification/asset-class";
import { useLedgerNavigationState } from "@/hooks/use-ledger-navigation-state";
import { LedgerPageView } from "./page-view";
import { LedgerPageStoryHarness } from "./page-view.story-harness";

const meta: Meta<typeof LedgerPageView> = {
  title: "Screens/Ledger/Overview",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  component: LedgerPageView,
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

export const AccountActionsMenuView: Story = {
  args: { onOpenImportPage: fn() },
  render: (args) => (
    <LedgerPageStoryHarness onOpenImportPage={args.onOpenImportPage} />
  ),
  name: "Account Actions Menu Playground",
  tags: ["!regression"],
  play: undefined,
};

export const AccountActionsMenu: Story = {
  ...AccountActionsMenuView,
  name: "Account Actions Menu Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const actionButtons = within(
      canvas.getByRole("button", { name: "Account Actions" }).parentElement!,
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Import Statement" }),
    );
    await expect(args.onOpenImportPage).toHaveBeenCalledTimes(1);
    await expect(
      actionButtons.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Account Actions" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    });
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Archive" })).toBeVisible();
    });
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    });
    await expect(screen.getAllByRole("menuitem")[0]).toHaveTextContent("Edit");
    await expect(
      screen.queryByRole("menuitem", { name: "Import Statement" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Account" });
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await userEvent.click(
      canvas.getByRole("button", { name: "Account Actions" }),
    );
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    });
  },
};

export const ArchivedAccountActionsMenuView: Story = {
  render: () => <LedgerPageStoryHarness accountActive={false} />,
  name: "Archived Account Actions Menu Playground",
  tags: ["!regression"],
  play: undefined,
};

export const ArchivedAccountActionsMenu: Story = {
  ...ArchivedAccountActionsMenuView,
  name: "Archived Account Actions Menu Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("heading", { name: "Checking" }),
    ).toBeVisible();
    await expect(canvas.getByText("Archived")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Import Statement" }),
    ).toBeEnabled();
    await expect(
      canvas.queryByRole("link", { name: "Accounts" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("link", { name: "Archive" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: "Account Actions" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    });
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Unarchive" })).toBeVisible();
    });
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    });
  },
};

export const DisabledAccountActionsMenuView: Story = {
  render: () => <LedgerPageStoryHarness accountActionsDisabled={true} />,
  name: "Disabled Account Actions Menu Playground",
  tags: ["!regression"],
  play: undefined,
};

export const DisabledAccountActionsMenu: Story = {
  ...DisabledAccountActionsMenuView,
  name: "Disabled Account Actions Menu Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Account Actions" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    });
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Archive" })).toBeDisabled();
    });
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
    });
  },
};

export const MissingStatementImportCsvFormatView: Story = {
  render: () => <LedgerPageStoryHarness hasStatementImportCsvFormat={false} />,
  name: "Missing Statement Import Csv Format Playground",
  tags: ["!regression"],
  play: undefined,
};

export const MissingStatementImportCsvFormat: Story = {
  ...MissingStatementImportCsvFormatView,
  name: "Missing Statement Import Csv Format Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const actionButtons = within(
      canvas.getByRole("button", { name: "Account Actions" }).parentElement!,
    );
    await expect(
      actionButtons.getByRole("button", { name: "Edit" }),
    ).toBeEnabled();
    await expect(
      canvas.queryByRole("button", { name: "Import Statement" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Account Actions" }),
    );
    const importItem = await screen.findByRole("menuitem", {
      name: "Import Statement",
    });
    await expect(importItem).toBeDisabled();
    await userEvent.hover(importItem.parentElement!);
    await waitFor(() =>
      expect(
        screen.getByRole("tooltip", {
          name: "Statement imports require a CSV format configured on this account.",
        }),
      ).toBeVisible(),
    );
  },
};

function categoryActionsMenuPlay(
  equitySubtype: EquityAccountSubtype,
): NonNullable<Story["play"]> {
  return async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const actionButtons = within(
      canvas.getByRole("button", { name: "Category Actions" }).parentElement!,
    );
    await expect(
      actionButtons.getByRole("button", { name: "Edit" }),
    ).toBeEnabled();
    await expect(
      canvas.queryByRole("button", { name: "Import Statement" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Category Actions" }),
    );
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Archive" })).toBeVisible();
      expect(screen.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    });
    if (equitySubtype !== EquityAccountSubtype.GAIN_LOSS) {
      await expect(
        screen.getByRole("menuitem", { name: "Manage Category" }),
      ).toBeEnabled();
    } else {
      await expect(
        screen.queryByRole("menuitem", { name: "Manage Category" }),
      ).not.toBeInTheDocument();
      await expect(
        screen.getByRole("menu").querySelector(".mantine-Menu-divider"),
      ).not.toBeInTheDocument();
    }
    await expect(
      screen.queryByRole("menuitem", { name: "Import Statement" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(actionButtons.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Category" });
    await waitFor(() => expect(dialog).toBeVisible());
  };
}

export const CategoryActionsMenuView: Story = {
  render: () => (
    <LedgerPageStoryHarness
      accountType={AccountType.EQUITY}
      equitySubtype={EquityAccountSubtype.EXPENSE}
    />
  ),
  name: "Category Actions Menu Playground",
  tags: ["!regression"],
  play: undefined,
};

export const CategoryActionsMenu: Story = {
  ...CategoryActionsMenuView,
  name: "Category Actions Menu Interaction Test",
  tags: ["regression", "!autodocs"],
  play: categoryActionsMenuPlay(EquityAccountSubtype.EXPENSE),
};

export const IncomeCategoryActionsMenuView: Story = {
  render: () => (
    <LedgerPageStoryHarness
      accountType={AccountType.EQUITY}
      equitySubtype={EquityAccountSubtype.INCOME}
    />
  ),
  name: "Income Category Actions Menu Playground",
  tags: ["!regression"],
  play: undefined,
};

export const IncomeCategoryActionsMenu: Story = {
  ...IncomeCategoryActionsMenuView,
  name: "Income Category Actions Menu Interaction Test",
  tags: ["regression", "!autodocs"],
  play: categoryActionsMenuPlay(EquityAccountSubtype.INCOME),
};

export const GainLossCategoryActionsMenuView: Story = {
  render: () => (
    <LedgerPageStoryHarness
      accountType={AccountType.EQUITY}
      equitySubtype={EquityAccountSubtype.GAIN_LOSS}
    />
  ),
  name: "Gain Loss Category Actions Menu Playground",
  tags: ["!regression"],
  play: undefined,
};

export const GainLossCategoryActionsMenu: Story = {
  ...GainLossCategoryActionsMenuView,
  name: "Gain Loss Category Actions Menu Interaction Test",
  tags: ["regression", "!autodocs"],
  play: categoryActionsMenuPlay(EquityAccountSubtype.GAIN_LOSS),
};

export const DisabledEditMenuActionView: Story = {
  render: () => (
    <LedgerPageStoryHarness accountEditDisabledReason="This account cannot be edited." />
  ),
  name: "Disabled Edit Menu Action Playground",
  tags: ["!regression"],
  play: undefined,
};

export const DisabledEditMenuAction: Story = {
  ...DisabledEditMenuActionView,
  name: "Disabled Edit Menu Action Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Import Statement" }),
    ).toBeEnabled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Account Actions" }),
    );
    const editItem = await screen.findByRole("menuitem", {
      name: "Edit",
    });
    await expect(editItem).toBeDisabled();
    await userEvent.hover(editItem.parentElement!);
    await waitFor(() =>
      expect(
        screen.getByRole("tooltip", {
          name: "This account cannot be edited.",
        }),
      ).toBeVisible(),
    );
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

export const PeriodFilterRouteSmoke: Story = {
  parameters: {
    router: {
      initialPath: "/storybook-book/account-checking",
    },
  },
  render: () => (
    <LedgerPageStoryHarness
      routeSmoke={true}
      includePeriodFilterControls={true}
      accountType={AccountType.EQUITY}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "(none)",
    );
    await userEvent.click(canvas.getByRole("button", { name: "All Periods" }));
    await expect(
      await screen.findByRole("button", { name: "Clear Filter" }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: "Year" }));
    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "(none)",
    );

    await userEvent.click(screen.getByRole("radio", { name: "Month" }));
    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "(none)",
    );

    await userEvent.click(screen.getByRole("button", { name: /Feb/i }));

    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "2026-02",
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Previous Period" }),
    );
    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "2026-01",
    );

    await userEvent.click(canvas.getByRole("button", { name: "January 2026" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear Filter" }));
    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "(none)",
    );
  },
  name: "Period Filter Route Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
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

function StableLedgerNavigationHarness() {
  const navigate = useNavigate();
  const navigationState = useLedgerNavigationState();
  const [initialState] = useState(() => navigationState);
  const [renders, setRenders] = useState(0);
  return (
    <>
      <Button onClick={() => setRenders((count) => count + 1)}>
        Render Modal State
      </Button>
      <Button
        onClick={async () => {
          await navigate({
            to: "/$accountBookId/report",
            params: { accountBookId: "storybook-book" },
            search: { period: "2026-02" },
          });
          setRenders((count) => count + 1);
        }}
      >
        Change Source Period
      </Button>
      <Text data-testid="source-href">
        {navigationState().ledgerReturnTarget?.href}
      </Text>
      <Text data-testid="local-render-count">{renders}</Text>
      <Text data-testid="stable-navigation-state">
        {String(initialState === navigationState)}
      </Text>
    </>
  );
}

export const StableNavigationStateView: Story = {
  parameters: {
    router: { initialPath: "/storybook-book/report?period=2026-01" },
  },
  render: () => <StableLedgerNavigationHarness />,
  name: "Stable Navigation State Playground",
  tags: ["!regression"],
  play: undefined,
};

export const StableNavigationState: Story = {
  ...StableNavigationStateView,
  name: "Stable Navigation State Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Render Modal State" }),
    );
    await expect(canvas.getByTestId("local-render-count")).toHaveTextContent(
      "1",
    );
    await expect(
      canvas.getByTestId("stable-navigation-state"),
    ).toHaveTextContent("true");
    await userEvent.click(
      canvas.getByRole("button", { name: "Change Source Period" }),
    );
    await expect(canvas.getByTestId("source-href")).toHaveTextContent(
      "/storybook-book/report?period=2026-02",
    );
    await expect(
      canvas.getByTestId("stable-navigation-state"),
    ).toHaveTextContent("true");
  },
};
