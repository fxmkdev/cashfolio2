import { Box, Group, Stack, Text, TreeSelect } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { LedgerAccountSwitcher } from "./account-switcher";
import {
  createSwitcherStoryTree,
  switcherStoryAccount,
} from "./account-switcher.story-fixtures";

const tree = createSwitcherStoryTree();
const meta: Meta<typeof LedgerAccountSwitcher> = {
  title: "Routes/LedgerAccountSwitcher",
  component: LedgerAccountSwitcher,
};
export default meta;
type Story = StoryObj<typeof meta>;

function NativeDesignComparison() {
  return (
    <Group align="flex-start" gap="xl" mih={500}>
      <Stack w={384} gap="sm">
        <Text fw={600}>Ledger Navigation</Text>
        <LedgerAccountSwitcher
          account={switcherStoryAccount}
          tree={tree}
          onSelectAccount={fn()}
        />
      </Stack>
      <Box w={384} data-testid="native-tree-select">
        <TreeSelect
          label="Native TreeSelect"
          data={tree.data}
          value={switcherStoryAccount.id}
          dropdownOpened
          defaultExpandedValues={tree.ancestorsByAccountId.get(
            switcherStoryAccount.id,
          )}
          comboboxProps={{ withinPortal: false }}
          maxDropdownHeight="20rem"
          withLines
        />
      </Box>
    </Group>
  );
}

export const NativeDesignLight: Story = {
  parameters: { colorScheme: "light" },
  render: () => <NativeDesignComparison />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /^Switch Account:/ }),
    );
    await waitFor(() =>
      expect(screen.getByRole("listbox", { name: "Accounts" })).toBeVisible(),
    );
    const native = within(canvas.getByTestId("native-tree-select"));
    const custom = within(screen.getByRole("listbox", { name: "Accounts" }));
    for (const name of ["Checking", "Savings"]) {
      const reference = native.getByRole("option", { name });
      const actual = custom.getByRole("option", { name });
      const expectedStyles = getComputedStyle(reference);
      const actualStyles = getComputedStyle(actual);
      for (const property of [
        "padding-top",
        "padding-bottom",
        "padding-inline-start",
        "font-size",
        "line-height",
        "border-radius",
      ]) {
        await expect(actualStyles.getPropertyValue(property)).toBe(
          expectedStyles.getPropertyValue(property),
        );
      }
      await expect(actual).toHaveAttribute(
        "aria-level",
        reference.getAttribute("aria-level")!,
      );
    }
    const selected = custom.getByRole("option", { name: "Checking" });
    await expect(selected).toHaveAttribute("aria-selected", "true");
    await expect(
      selected.querySelector("svg")!.getBoundingClientRect().width,
    ).toBe(
      native
        .getByRole("option", { name: "Checking" })
        .querySelector("svg")!
        .getBoundingClientRect().width,
    );
    const branch = custom
      .getByText("Main Bank", { exact: true })
      .closest<HTMLElement>('[role="option"]')!;
    await expect(
      within(branch).getByRole("button", { name: "Collapse" }),
    ).toBeVisible();
  },
};

export const NativeDesignDark: Story = {
  ...NativeDesignLight,
  parameters: { colorScheme: "dark" },
};
