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

export const BrowseAndSearch: Story = {
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByRole("textbox", {
      name: "Switch Account",
    });
    await expect(input).toHaveValue("Checking");
    await userEvent.click(input);
    await expect(input).toHaveValue("");
    await expect(
      screen.getByRole("option", { name: "Checking" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(screen.getByRole("option", { name: "Savings" })).toBeVisible();
    await expect(
      screen.queryByRole("option", { name: "Travel EUR" }),
    ).not.toBeInTheDocument();
    await expect(
      screen.getByRole("option", { name: "Empty Group" }),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("option", { name: /Other Bank/ }));
    await expect(
      screen.getByRole("option", { name: "Travel EUR" }),
    ).toBeVisible();
    await expect(args.onSelectAccount).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("option", { name: /Other Bank/ }));
    await expect(
      screen.queryByRole("option", { name: "Travel EUR" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "Checking" }));
    await expect(args.onSelectAccount).not.toHaveBeenCalled();
    await userEvent.click(input);
    await userEvent.type(input, "Checking");
    await expect(
      screen.getAllByRole("option", { name: "Checking" }),
    ).toHaveLength(2);
    await expect(
      screen.queryByRole("option", { name: "Savings" }),
    ).not.toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, " OTHER BANK / CHECKING ");
    const result = screen.getByRole("option", { name: "Checking" });
    await expect(result).toHaveAttribute("aria-selected", "false");
    await expect(
      screen.getByRole("option", { name: /Other Bank/ }),
    ).toBeVisible();
    await userEvent.click(result);
    await expect(args.onSelectAccount).toHaveBeenCalledWith("other-checking");
    await expect(args.onSelectAccount).toHaveBeenCalledTimes(1);
  },
};

export const KeyboardAndDismissal: Story = {
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByRole("textbox", {
      name: "Switch Account",
    });
    await userEvent.click(input);
    await userEvent.type(input, "Savings");
    await userEvent.keyboard("{ArrowDown}");
    await expect(args.onSelectAccount).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await expect(input).toHaveValue("Checking");
    await userEvent.click(input);
    await expect(input).toHaveValue("");
    await expect(screen.getByRole("option", { name: "Savings" })).toBeVisible();
    await userEvent.type(input, "no matching account");
    await expect(screen.getByText("No accounts found")).toBeVisible();
    await userEvent.clear(input);
    await userEvent.type(input, "Savings");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
    await expect(args.onSelectAccount).toHaveBeenCalledWith("savings");
    await expect(args.onSelectAccount).toHaveBeenCalledTimes(1);
    await expect(input).toHaveValue("Checking");
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
      within(canvasElement).getByRole("textbox", { name: "Switch Account" }),
    );
    const selected = screen.getByRole("option", { name: "Last Account" });
    await waitFor(() => {
      const dropdown = screen.getByRole("listbox").getBoundingClientRect();
      const option = selected.getBoundingClientRect();
      expect(option.top).toBeGreaterThanOrEqual(dropdown.top - 1);
      expect(option.bottom).toBeLessThanOrEqual(dropdown.bottom + 1);
    });
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
    const input = () => canvas.getByRole("textbox", { name: "Switch Account" });
    await userEvent.click(input());
    await userEvent.type(input(), "Retired Account");
    await userEvent.click(
      screen.getByRole("option", { name: "Retired Account" }),
    );
    await expect(canvas.getByTestId("selected-account")).toHaveTextContent(
      "retired",
    );
    await userEvent.click(input());
    await expect(
      screen.getByRole("option", { name: "Retired Account" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      screen.queryByRole("option", { name: "Travel EUR" }),
    ).not.toBeInTheDocument();
    await userEvent.type(input(), "Travel EUR");
    await userEvent.click(screen.getByRole("option", { name: "Travel EUR" }));
    await userEvent.click(input());
    await expect(
      screen.getByRole("option", { name: "Travel EUR" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      screen.queryByRole("option", { name: "Savings" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  },
};
