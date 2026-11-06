import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import { expect, fn, userEvent, within } from "storybook/test";
import { SettingsNavigation } from "../-settings-navigation";
import { DangerZonePageView } from "./-page-view";

const meta = {
  title: "Routes/DangerZonePageView",
  component: DangerZonePageView,
  parameters: {
    router: { initialPath: "/storybook-book/settings/danger-zone" },
    colorScheme: "light",
  },
  args: {
    accountBookName: "Household",
    onDelete: fn(async () => undefined),
  },
  render: (args) => (
    <Box p="md">
      <SettingsNavigation
        accountBookId="storybook-book"
        categories={false}
        dangerZone
      />
      <DangerZonePageView {...args} />
    </Box>
  ),
} satisfies Meta<typeof DangerZonePageView>;

export default meta;
type Story = StoryObj<typeof meta>;

async function openDeleteDialog(canvasElement: HTMLElement) {
  await userEvent.click(
    within(canvasElement).getByRole("button", { name: "Delete Account Book" }),
  );
  return within(
    await within(canvasElement.ownerDocument.body).findByRole("dialog", {
      name: "Delete Account Book",
    }),
  );
}

export const DangerZone: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tablist = canvas.getByRole("tablist", {
      name: "Account Book Settings",
    });
    const tabs = within(tablist);
    const dangerTab = tabs.getByRole("tab", { name: "Danger Zone" });
    await expect(dangerTab).toHaveAttribute("aria-selected", "true");
    await expect(dangerTab).toHaveAttribute(
      "href",
      "/storybook-book/settings/danger-zone",
    );
    await expect(tabs.getByRole("tab", { name: "General" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    await expect(
      canvas.queryByRole("heading", { name: "Danger Zone" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByText(
        "Permanently delete this account book and all data inside it.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Delete Account Book" }),
    ).toBeVisible();
    const warningIcon = dangerTab.querySelector("svg");
    await expect(warningIcon).toBeVisible();
    await expect(warningIcon).toHaveAttribute("aria-hidden", "true");
    await expect(warningIcon).toHaveAttribute("width", "16");
    await expect(warningIcon).toHaveAttribute("height", "16");
    await expect(
      canvas.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();

    const tabStyle = getComputedStyle(dangerTab);
    for (const color of [tabStyle.color, tabStyle.borderBottomColor]) {
      const [red, green, blue] = color.match(/[\d.]+/g)!.map(Number);
      await expect(red).toBeGreaterThan(green);
      await expect(red).toBeGreaterThan(blue);
    }
    await expect(tablist.scrollWidth).toBeLessThanOrEqual(tablist.clientWidth);
    await expect(dangerTab.getBoundingClientRect().right).toBeCloseTo(
      tablist.getBoundingClientRect().right,
      0,
    );
  },
};

export const DangerZoneDark: Story = {
  ...DangerZone,
  parameters: { colorScheme: "dark" },
};

export const DangerZoneMobile: Story = {
  ...DangerZone,
  parameters: { viewport: { defaultViewport: "cashfolioMobile" } },
};

export const DangerZoneMobileDark: Story = {
  ...DangerZone,
  parameters: {
    colorScheme: "dark",
    viewport: { defaultViewport: "cashfolioMobile" },
  },
};

export const DeleteConfirmation: Story = {
  play: async ({ canvasElement, args }) => {
    let dialog = await openDeleteDialog(canvasElement);
    const deletion = dialog.getByRole("button", {
      name: "Delete Account Book",
    });
    await expect(deletion).toBeDisabled();
    const name = dialog.getByLabelText("Account Book Name");
    await userEvent.type(name, "household");
    await expect(deletion).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, "Household");
    await expect(deletion).toBeEnabled();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await expect(args.onDelete).not.toHaveBeenCalled();

    dialog = await openDeleteDialog(canvasElement);
    await expect(dialog.getByLabelText("Account Book Name")).toHaveValue("");
    await expect(
      dialog.getByRole("button", { name: "Delete Account Book" }),
    ).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  },
};

export const Delete: Story = {
  play: async ({ canvasElement, args }) => {
    const dialog = await openDeleteDialog(canvasElement);
    await userEvent.type(
      dialog.getByLabelText("Account Book Name"),
      "Household",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Delete Account Book" }),
    );
    await expect(args.onDelete).toHaveBeenCalledOnce();
    await expect(args.onDelete).toHaveBeenCalledWith({
      confirmationName: "Household",
    });
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  },
};

export const DeleteFailure: Story = {
  args: {
    onDelete: fn(async () => {
      throw new Error("Could not delete account book.");
    }),
    onRefreshConstraints: fn(async () => undefined),
  },
  play: async ({ canvasElement, args }) => {
    const dialog = await openDeleteDialog(canvasElement);
    await userEvent.type(
      dialog.getByLabelText("Account Book Name"),
      "Household",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Delete Account Book" }),
    );
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Could not delete account book.",
    );
    await expect(args.onRefreshConstraints).toHaveBeenCalledOnce();
    await expect(dialog.getByLabelText("Account Book Name")).toHaveValue(
      "Household",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));

    const reopened = await openDeleteDialog(canvasElement);
    await expect(reopened.queryByRole("alert")).not.toBeInTheDocument();
    await expect(reopened.getByLabelText("Account Book Name")).toHaveValue("");
    await userEvent.click(reopened.getByRole("button", { name: "Cancel" }));
  },
};
