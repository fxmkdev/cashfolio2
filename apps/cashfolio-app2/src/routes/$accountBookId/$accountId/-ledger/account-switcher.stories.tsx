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
      screen.queryByRole("listbox", { name: "Accounts" }),
    ).not.toBeInTheDocument(),
  );
}

async function expectOpen() {
  await waitFor(() =>
    expect(screen.getByRole("listbox", { name: "Accounts" })).toBeVisible(),
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
    await expect(canvas.queryByRole("combobox")).not.toBeInTheDocument();
    await userEvent.click(trigger);
    const search = await screen.findByRole("combobox", {
      name: "Search Accounts",
    });
    await waitFor(() => expect(search).toHaveFocus());
    await expectOpen();
    await expect(search).toHaveValue("");
    await expect(
      screen.getByRole("listbox", { name: "Accounts" }),
    ).toBeVisible();
    await expect(
      screen.getByRole("option", { name: "Checking" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(screen.getByRole("option", { name: "Savings" })).toBeVisible();
    await expect(
      screen.queryByRole("option", { name: "Travel EUR" }),
    ).not.toBeInTheDocument();
    await expect(
      screen.queryByText("Empty Group", { exact: true }),
    ).not.toBeInTheDocument();
    await userEvent.type(search, "Retired Account");
    await expect(screen.getByText("No accounts found")).toBeVisible();
    await expect(
      screen.queryByRole("option", { name: "Retired Account" }),
    ).not.toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.click(screen.getByText("Other Bank", { exact: true }));
    await expect(
      screen.getByRole("option", { name: "Travel EUR" }),
    ).toBeVisible();
    await expect(args.onSelectAccount).not.toHaveBeenCalled();
    const branch = screen
      .getByText("Other Bank", { exact: true })
      .closest<HTMLElement>('[role="option"]')!;
    await userEvent.click(
      within(branch).getByRole("button", { name: "Collapse" }),
    );
    await expect(
      screen.queryByRole("option", { name: "Travel EUR" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(branch).getByRole("button", { name: "Expand" }),
    );
    await expect(
      screen.getByRole("option", { name: "Travel EUR" }),
    ).toBeVisible();
    await userEvent.type(search, "Checking");
    await expect(
      screen.getAllByRole("option", { name: "Checking" }),
    ).toHaveLength(2);
    await expect(
      screen.queryByRole("option", { name: "Savings" }),
    ).not.toBeInTheDocument();
    await userEvent.clear(search);
    await expect(
      screen.queryByRole("option", { name: "Travel EUR" }),
    ).not.toBeInTheDocument();
    await userEvent.type(search, " OTHER BANK / CHECKING ");
    const result = screen.getByRole("option", { name: "Checking" });
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
      screen.getByRole("combobox", { name: "Search Accounts" });
    await waitFor(() => expect(search()).toHaveFocus());
    await expectOpen();
    await userEvent.keyboard("{ArrowDown}");
    await expect(
      screen.getByRole("option", { name: "Checking" }),
    ).toHaveAttribute("id", search().getAttribute("aria-activedescendant"));
    await expect(search()).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}{Enter}");
    await expect(
      screen.queryByRole("option", { name: "Savings" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    await expect(screen.getByRole("option", { name: "Savings" })).toBeVisible();
    await expect(args.onSelectAccount).not.toHaveBeenCalled();
    await userEvent.type(search(), "no matching account");
    await expect(screen.getByText("No accounts found")).toBeVisible();
    await expect(search()).not.toHaveAttribute("aria-activedescendant");
    await userEvent.keyboard("{Escape}");
    await expectClosed();
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard(" ");
    await waitFor(() => expect(search()).toHaveFocus());
    await expectOpen();
    await expect(search()).toHaveValue("");
    await userEvent.type(search(), "Savings");
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(search()).toHaveAttribute(
        "aria-activedescendant",
        screen.getByRole("option", { name: "Savings" }).id,
      ),
    );
    await expect(search()).toHaveFocus();
    await expect(args.onSelectAccount).not.toHaveBeenCalled();
    await userEvent.keyboard("{ArrowUp}{ArrowLeft}");
    await expect(
      screen.queryByRole("option", { name: "Savings" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
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
    await screen.findByRole("option", { name: "Checking" });
    await expectOpen();
    await userEvent.click(screen.getByRole("option", { name: "Checking" }));
    await expect(args.onSelectAccount).not.toHaveBeenCalled();
    await expectClosed();
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await screen.findByRole("listbox", { name: "Accounts" });
    await expectOpen();
    await userEvent.click(trigger);
    await expectClosed();
    await userEvent.click(trigger);
    await screen.findByRole("listbox", { name: "Accounts" });
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
    const selected = await screen.findByRole("option", {
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
      screen.getByRole("combobox", { name: "Search Accounts" }),
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
              name: id === "savings" ? "Savings" : "Travel EUR",
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
      const search = await screen.findByRole("combobox", {
        name: "Search Accounts",
      });
      await expectOpen();
      return search;
    };
    await userEvent.type(await open(), "Savings");
    await userEvent.click(screen.getByRole("option", { name: "Savings" }));
    await expect(canvas.getByTestId("selected-account")).toHaveTextContent(
      "savings",
    );
    await open();
    await expect(
      screen.getByRole("option", { name: "Savings" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      screen.queryByRole("option", { name: "Travel EUR" }),
    ).not.toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("combobox", { name: "Search Accounts" }),
      "Travel EUR",
    );
    await userEvent.click(screen.getByRole("option", { name: "Travel EUR" }));
    await open();
    await expect(
      screen.getByRole("option", { name: "Travel EUR" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      screen.queryByRole("option", { name: "Savings" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  },
};

export const ArchivedLedger: Story = {
  args: { account: { id: "retired", name: "Retired Account" } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Retired Account", level: 2 }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Switch Account: Retired Account" }),
    );
    await expectOpen();
    const list = screen.getByRole("listbox", { name: "Accounts" });
    await expect(
      within(list).queryAllByRole("option", { selected: true }),
    ).toHaveLength(0);
    await expect(
      screen.queryByRole("option", { name: "Retired Account" }),
    ).not.toBeInTheDocument();
    const search = screen.getByRole("combobox", { name: "Search Accounts" });
    await expect(search).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(search).toHaveAttribute(
        "aria-activedescendant",
        screen.getByRole("option", { name: "Checking" }).id,
      ),
    );
    await userEvent.keyboard("{Enter}");
    await expect(args.onSelectAccount).toHaveBeenCalledWith("checking");
    await expect(args.onSelectAccount).toHaveBeenCalledTimes(1);
    await expectClosed();
  },
};

export const NoActiveAccounts: Story = {
  args: {
    account: { id: "retired", name: "Retired Account" },
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
      accounts: [
        {
          id: "retired",
          name: "Retired Account",
          groupId: "bank",
          type: AccountType.BALANCE,
          isActive: false,
          sortOrder: 0,
        },
      ],
    }),
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Switch Account: Retired Account",
      }),
    );
    await expectOpen();
    await expect(screen.getByText("No accounts found")).toBeVisible();
    await expect(screen.queryAllByRole("option")).toHaveLength(0);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(args.onSelectAccount).not.toHaveBeenCalled();
    await expect(
      screen.getByRole("combobox", { name: "Search Accounts" }),
    ).not.toHaveAttribute("aria-activedescendant");
    await userEvent.keyboard("{Escape}");
    await expectClosed();
  },
};
