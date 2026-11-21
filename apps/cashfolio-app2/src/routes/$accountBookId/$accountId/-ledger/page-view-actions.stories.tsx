import type { Meta, StoryObj } from "@storybook/react-vite";
import { LedgerPageView } from "./page-view";
import { LedgerPageStoryHarness } from "./page-view.story-harness";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import { ledgerPageStoryMeta } from "./page-view.story-meta";

const meta: Meta<typeof LedgerPageView> = {
  ...ledgerPageStoryMeta,
  title: "Screens/Ledger/Overview",
};
export default meta;
type Story = StoryObj<typeof meta>;

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
