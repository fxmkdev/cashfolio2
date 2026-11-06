import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import { useRouterState } from "@tanstack/react-router";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { SettingsNavigation } from "./-settings-navigation";
import { SettingsActions } from "./-settings-actions";

const meta = {
  title: "Routes/Settings/Actions",
  component: SettingsActions,
  parameters: {
    router: { initialPath: "/storybook-book/settings" },
    colorScheme: "light",
  },
  args: {
    accountBookName: "Household",
    onDelete: fn(async (): Promise<void> => undefined),
  },
  render: function Render(args) {
    const pathname = useRouterState({
      select: (state) => state.location.pathname,
    });
    return (
      <Box p="md">
        <SettingsNavigation
          accountBookId="storybook-book"
          categories={pathname.endsWith("/categories")}
          classifications={pathname.endsWith("/classifications")}
          actions={<SettingsActions {...args} />}
        />
      </Box>
    );
  },
} satisfies Meta<typeof SettingsActions>;

export default meta;
type Story = StoryObj<typeof meta>;

async function openDeleteDialog(canvasElement: HTMLElement) {
  await userEvent.click(
    within(canvasElement).getByRole("button", {
      name: "More Account Book Actions",
    }),
  );
  await userEvent.click(
    await within(canvasElement.ownerDocument.body).findByRole("menuitem", {
      name: "Delete Account Book…",
    }),
  );
  return within(
    await within(canvasElement.ownerDocument.body).findByRole("dialog", {
      name: "Delete Account Book",
    }),
  );
}

export const MoreMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tablist = canvas.getByRole("tablist", {
      name: "Account Book Settings",
    });
    const tabs = within(tablist);
    const body = within(canvasElement.ownerDocument.body);
    await expect(tabs.getAllByRole("tab")).toHaveLength(3);
    await expect(
      tabs.queryByRole("tab", { name: "Danger Zone" }),
    ).not.toBeInTheDocument();
    await expect(tabs.getByRole("tab", { name: "General" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      canvas.queryByRole("heading", { name: "Danger Zone" }),
    ).not.toBeInTheDocument();
    await expect(
      body.queryByRole("menuitem", { name: "Delete Account Book…" }),
    ).not.toBeInTheDocument();
    const more = canvas.getByRole("button", {
      name: "More Account Book Actions",
    });
    await expect(more).toHaveTextContent("More");
    await expect(tablist.contains(more)).toBe(false);
    const [red, green] = getComputedStyle(more)
      .color.match(/[\d.]+/g)!
      .map(Number);
    await expect(red).toBeLessThanOrEqual(green);
    await expect(tablist.scrollWidth).toBeLessThanOrEqual(tablist.clientWidth);
    await expect(
      canvasElement.ownerDocument.documentElement.scrollWidth,
    ).toBeLessThanOrEqual(window.innerWidth);
    more.focus();
    await userEvent.keyboard("{Enter}");
    const deletion = await body.findByRole("menuitem", {
      name: "Delete Account Book…",
    });
    await expect(deletion).toBeVisible();
    const [itemRed, itemGreen, itemBlue] = getComputedStyle(deletion)
      .color.match(/[\d.]+/g)!
      .map(Number);
    await expect(itemRed).toBeGreaterThan(itemGreen);
    await expect(itemRed).toBeGreaterThan(itemBlue);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(more).toHaveFocus());
  },
};

export const MoreMenuDark: Story = {
  ...MoreMenu,
  parameters: { colorScheme: "dark" },
};

export const MoreMenuMobile: Story = {
  ...MoreMenu,
  parameters: { viewport: { defaultViewport: "cashfolioMobile" } },
};

export const MoreMenuMobileDark: Story = {
  ...MoreMenu,
  parameters: {
    colorScheme: "dark",
    viewport: { defaultViewport: "cashfolioMobile" },
  },
};

export const DeleteConfirmation: Story = {
  play: async ({ canvasElement, args }) => {
    let dialog = await openDeleteDialog(canvasElement);
    await waitFor(() =>
      expect(dialog.getByLabelText("Account Book Name")).toHaveFocus(),
    );
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
    await waitFor(() =>
      expect(
        within(canvasElement).getByRole("button", {
          name: "More Account Book Actions",
        }),
      ).toHaveFocus(),
    );

    dialog = await openDeleteDialog(canvasElement);
    await expect(dialog.getByLabelText("Account Book Name")).toHaveValue("");
    await expect(
      dialog.getByRole("button", { name: "Delete Account Book" }),
    ).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  },
};

export const KeyboardConfirmation: Story = {
  play: async ({ canvasElement }) => {
    const more = within(canvasElement).getByRole("button", {
      name: "More Account Book Actions",
    });
    const body = within(canvasElement.ownerDocument.body);
    more.focus();
    await userEvent.keyboard("{Enter}");
    const deletion = await body.findByRole("menuitem", {
      name: "Delete Account Book…",
    });
    deletion.focus();
    await userEvent.keyboard("{Enter}");
    const dialog = within(
      await body.findByRole("dialog", { name: "Delete Account Book" }),
    );
    await waitFor(() =>
      expect(dialog.getByLabelText("Account Book Name")).toHaveFocus(),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(more).toHaveFocus());
  },
};

export const DeletePending: Story = {
  play: async ({ canvasElement, args }) => {
    let release!: () => void;
    args.onDelete.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const more = within(canvasElement).getByRole("button", {
      name: "More Account Book Actions",
    });
    const dialog = await openDeleteDialog(canvasElement);
    const name = dialog.getByLabelText("Account Book Name");
    const cancel = dialog.getByRole("button", { name: "Cancel" });
    const deletion = dialog.getByRole("button", {
      name: "Delete Account Book",
    });
    await userEvent.type(name, "Household");
    await userEvent.click(deletion);
    try {
      await expect(more).toBeDisabled();
      await expect(name).toBeDisabled();
      await expect(cancel).toBeDisabled();
      await expect(deletion).toBeDisabled();
      await userEvent.keyboard("{Escape}");
      await expect(cancel).toBeVisible();
      await expect(args.onDelete).toHaveBeenCalledOnce();
    } finally {
      release();
    }
    await waitFor(() => expect(cancel).toBeEnabled());
    await userEvent.click(cancel);
    await waitFor(() => expect(more).toHaveFocus());
  },
};

export const CategoriesMenu: Story = {
  parameters: {
    router: { initialPath: "/storybook-book/settings/categories" },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("tab", { name: "Categories" }),
    ).toHaveAttribute("aria-selected", "true");
    const dialog = await openDeleteDialog(canvasElement);
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  },
};

export const AssetClassesMenu: Story = {
  parameters: {
    router: { initialPath: "/storybook-book/settings/classifications" },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("tab", { name: "Asset Classes" }),
    ).toHaveAttribute("aria-selected", "true");
    const dialog = await openDeleteDialog(canvasElement);
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
