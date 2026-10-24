import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import { expect, fn, userEvent, within } from "storybook/test";
import { SettingsPageView } from "./-page-view";
import { SettingsNavigation } from "./-settings-navigation";

const meta = {
  title: "Routes/SettingsPageView",
  component: SettingsPageView,
  parameters: {
    router: { initialPath: "/storybook-book/settings" },
  },
  args: {
    accountBookId: "storybook-book",
    settings: {
      id: "storybook-book",
      name: "Household",
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      unitUsage: { currencies: ["CHF"], cryptocurrencies: [] },
    },
    onSubmit: fn(async () => undefined),
    onDelete: fn(async () => undefined),
  },
  render: (args) => (
    <Box p="md">
      <SettingsNavigation
        accountBookId={args.accountBookId}
        categories={false}
      />
      <SettingsPageView {...args} />
    </Box>
  ),
} satisfies Meta<typeof SettingsPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const General: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tabs = within(
      canvas.getByRole("tablist", { name: "Account Book Settings" }),
    );
    await expect(tabs.getByRole("tab", { name: "General" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(canvas.getByLabelText(/Account Book Name/)).toHaveValue(
      "Household",
    );
    await expect(
      canvas.getByRole("heading", { name: "Danger Zone" }),
    ).toBeVisible();
  },
};

export const Save: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByLabelText(/Account Book Name/);
    await userEvent.clear(name);
    await userEvent.type(name, "Household Updated");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(args.onSubmit).toHaveBeenCalledWith({
      name: "Household Updated",
      referenceCurrency: "CHF",
      startDate: "2026-01-01T00:00:00.000Z",
    });
  },
};

export const DeleteConfirmation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Delete Account Book" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Delete Account Book",
      }),
    );
    const deletion = dialog.getByRole("button", {
      name: "Delete Account Book",
    });
    await expect(deletion).toBeDisabled();
    await userEvent.type(
      dialog.getByLabelText("Account Book Name"),
      "Household",
    );
    await expect(deletion).not.toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  },
};

export const GeneralMobile: Story = {
  ...General,
  parameters: { viewport: { defaultViewport: "cashfolioMobile" } },
};
