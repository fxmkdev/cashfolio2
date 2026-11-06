import { Box, Text } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { AccountType } from "@/.prisma-client/enums";
import { buildLedgerAccountSwitcherData } from "./account-switcher-data";
import { LedgerAccountSwitcher } from "./account-switcher";
import {
  createSwitcherStoryTree,
  switcherStoryAccount,
} from "./account-switcher.story-fixtures";

const tree = createSwitcherStoryTree();
const meta: Meta<typeof LedgerAccountSwitcher> = {
  title: "Routes/LedgerAccountSwitcher",
  component: LedgerAccountSwitcher,
  args: { account: switcherStoryAccount, tree, onSelectAccount: fn() },
};
export default meta;
type Story = StoryObj<typeof meta>;

async function expectClosed() {
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: /^Switch Account:/ }),
    ).not.toBeInTheDocument(),
  );
}

async function expectOpen() {
  await waitFor(() =>
    expect(
      screen.getByRole("dialog", { name: /^Switch Account:/ }),
    ).toBeVisible(),
  );
}

export const BrowseAndSearch: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", {
      name: "Switch Account: Checking",
    });
    await expect(
      canvas.getByRole("heading", { level: 2, name: "Checking" }),
    ).toBeVisible();
    await expect(canvas.getAllByText("Checking", { exact: true })).toHaveLength(
      1,
    );
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
    await userEvent.click(trigger);
    const search = await screen.findByRole("textbox", {
      name: "Search Accounts",
    });
    await waitFor(() => expect(search).toHaveFocus());
    await expectOpen();
    await expect(search).toHaveValue("");
    await expect(screen.getByRole("tree", { name: "Accounts" })).toBeVisible();
    await expect(
      screen.getByRole("treeitem", { name: "Checking" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      screen.getByRole("treeitem", { name: "Savings" }),
    ).toBeVisible();
    await expect(
      screen.queryByRole("treeitem", { name: "Travel EUR" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Empty Group", { exact: true }));
    await userEvent.keyboard("{Enter}");
    await expect(args.onSelectAccount).not.toHaveBeenCalled();
    await expect(
      screen.getByRole("dialog", { name: /^Switch Account:/ }),
    ).toBeVisible();
    await userEvent.click(screen.getByText("Other Bank", { exact: true }));
    await expect(
      screen.getByRole("treeitem", { name: "Travel EUR" }),
    ).toBeVisible();
    await expect(args.onSelectAccount).not.toHaveBeenCalled();
    await userEvent.type(search, "Checking");
    await expect(
      screen.getAllByRole("treeitem", { name: "Checking" }),
    ).toHaveLength(2);
    await expect(
      screen.queryByRole("treeitem", { name: "Savings" }),
    ).not.toBeInTheDocument();
    await userEvent.clear(search);
    await expect(
      screen.queryByRole("treeitem", { name: "Travel EUR" }),
    ).not.toBeInTheDocument();
    await userEvent.type(search, " OTHER BANK / CHECKING ");
    const result = screen.getByRole("treeitem", { name: "Checking" });
    await expect(result).toHaveAttribute("aria-selected", "false");
    await userEvent.click(
      within(result).getByText("Checking", { exact: true }),
    );
    await expect(args.onSelectAccount).toHaveBeenCalledWith("other-checking");
    await expect(args.onSelectAccount).toHaveBeenCalledTimes(1);
    await expectClosed();
    await expect(trigger).toHaveFocus();
  },
};

export const KeyboardAndDismissal: Story = {
  play: async ({ canvasElement, args }) => {
    const trigger = within(canvasElement).getByRole("button", {
      name: "Switch Account: Checking",
    });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const search = () =>
      screen.getByRole("textbox", { name: "Search Accounts" });
    await waitFor(() => expect(search()).toHaveFocus());
    await expectOpen();
    await userEvent.keyboard("{ArrowDown}");
    await expect(
      screen.getByRole("treeitem", { name: "Checking" }),
    ).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}{Enter}");
    await expect(
      screen.queryByRole("treeitem", { name: "Savings" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    await expect(
      screen.getByRole("treeitem", { name: "Savings" }),
    ).toBeVisible();
    await expect(args.onSelectAccount).not.toHaveBeenCalled();
    await userEvent.type(search(), "no matching account");
    await expect(screen.getByText("No accounts found")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expectClosed();
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard(" ");
    await waitFor(() => expect(search()).toHaveFocus());
    await expectOpen();
    await expect(search()).toHaveValue("");
    await userEvent.type(search(), "Savings");
    await userEvent.keyboard("{ArrowDown}");
    await expect(
      screen.getByRole("treeitem", { name: "Savings" }),
    ).toHaveFocus();
    await expect(args.onSelectAccount).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    await expect(args.onSelectAccount).toHaveBeenCalledWith("savings");
    await expect(args.onSelectAccount).toHaveBeenCalledTimes(1);
    await expectClosed();
    await expect(trigger).toHaveTextContent("Checking");
  },
};

export const CurrentAccountAndOutsideDismissal: Story = {
  play: async ({ canvasElement, args }) => {
    const trigger = within(canvasElement).getByRole("button", {
      name: "Switch Account: Checking",
    });
    await userEvent.click(trigger);
    await screen.findByRole("treeitem", { name: "Checking" });
    await expectOpen();
    await userEvent.click(screen.getByRole("treeitem", { name: "Checking" }));
    await expect(args.onSelectAccount).not.toHaveBeenCalled();
    await expectClosed();
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await screen.findByRole("dialog", { name: /^Switch Account:/ });
    await expectOpen();
    await userEvent.click(trigger);
    await expectClosed();
    await userEvent.click(trigger);
    await screen.findByRole("dialog", { name: /^Switch Account:/ });
    await expectOpen();
    await userEvent.click(canvasElement);
    await expectClosed();
    await expect(trigger).toHaveFocus();
  },
};

export const ScrollToCurrentAccount: Story = {
  args: {
    account: { id: "last-account", name: "Last Account" },
    tree: buildLedgerAccountSwitcherData({
      groups: [
        {
          id: "bank",
          name: "Bank",
          parentGroupId: null,
          isActive: true,
          sortOrder: 0,
        },
      ],
      accounts: Array.from({ length: 40 }, (_, index) => ({
        id: index === 39 ? "last-account" : `account-${index}`,
        name: index === 39 ? "Last Account" : `Account ${index}`,
        groupId: "bank",
        type: AccountType.BALANCE,
        isActive: true,
        sortOrder: index,
      })),
    }),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Switch Account: Last Account",
      }),
    );
    const selected = await screen.findByRole("treeitem", {
      name: "Last Account",
    });
    await waitFor(() => {
      const viewport = selected
        .closest("[data-scrollarea-viewport]")!
        .getBoundingClientRect();
      const option = selected.getBoundingClientRect();
      expect(option.top).toBeGreaterThanOrEqual(viewport.top - 1);
      expect(option.bottom).toBeLessThanOrEqual(viewport.bottom + 1);
    });
    await expect(
      screen.getByRole("textbox", { name: "Search Accounts" }),
    ).toHaveFocus();
    await userEvent.keyboard("{Escape}");
  },
};

export const SelectAndReopen: Story = {
  render: function SelectAndReopenHarness() {
    const [account, setAccount] = useState(switcherStoryAccount);
    return (
      <Box w={300}>
        <LedgerAccountSwitcher
          key={account.id}
          account={account}
          tree={tree}
          onSelectAccount={(id) =>
            setAccount({
              ...account,
              id,
              name: id === "retired" ? "Retired Account" : "Travel EUR",
            })
          }
        />
        <Text data-testid="selected-account">{account.id}</Text>
      </Box>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const open = async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: /^Switch Account:/ }),
      );
      const search = await screen.findByRole("textbox", {
        name: "Search Accounts",
      });
      await expectOpen();
      return search;
    };
    await userEvent.type(await open(), "Retired Account");
    await userEvent.click(
      screen.getByRole("treeitem", { name: "Retired Account" }),
    );
    await expect(canvas.getByTestId("selected-account")).toHaveTextContent(
      "retired",
    );
    await open();
    await expect(
      screen.getByRole("treeitem", { name: "Retired Account" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      screen.queryByRole("treeitem", { name: "Travel EUR" }),
    ).not.toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Search Accounts" }),
      "Travel EUR",
    );
    await userEvent.click(screen.getByRole("treeitem", { name: "Travel EUR" }));
    await open();
    await expect(
      screen.getByRole("treeitem", { name: "Travel EUR" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      screen.queryByRole("treeitem", { name: "Savings" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  },
};
