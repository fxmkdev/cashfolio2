import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AccountsPageView } from "../-page-view";
import {
  createOrganizerStoryApi,
  organizeStoryNodes,
} from "../-organize/story-fixtures";
import { AccountsPageStoryHarness } from "./harness";

const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
  parameters: {
    router: {
      initialPath:
        "/storybook-book/accounts?tab=BALANCE&mode=active&organize=true",
    },
  },
  render: (args) => (
    <AccountsPageStoryHarness
      initialMode="active"
      organizerApi={args.organizerApi}
    />
  ),
};
export default meta;
type Story = StoryObj<typeof meta>;

async function lifecycleRow(canvasElement: HTMLElement, id: string) {
  let element: HTMLElement | null = null;
  await waitFor(() => {
    element = canvasElement.querySelector<HTMLElement>(
      `.ag-row:not(.ag-opacity-zero)[row-id="${id}"]`,
    );
    expect(element).not.toBeNull();
    expect(element!.querySelector(".ag-group-value")).not.toBeNull();
  });
  return element!;
}

export const OrganizeCompactLayoutAndIcons: Story = {
  args: { organizerApi: createOrganizerStoryApi() },
  parameters: {
    router: { initialPath: "/storybook-book/accounts?tab=BALANCE&mode=active" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = canvas.getByRole("heading", { name: "Accounts" });
    const normalGap =
      (await canvas.findByRole("treegrid")).getBoundingClientRect().top -
      heading.getBoundingClientRect().bottom;
    const top = canvas
      .getByRole("button", { name: "Organize" })
      .getBoundingClientRect().top;
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    await canvas.findByRole("region", { name: "Organize Accounts" });
    const row = await lifecycleRow(canvasElement, "checking");
    await expect(
      canvas.getByRole("button", { name: "Done" }).getBoundingClientRect().top,
    ).toBeCloseTo(top, 0);
    await expect(
      canvas.getByText("Organizing", { exact: true }).getBoundingClientRect()
        .height,
    ).toBeGreaterThanOrEqual(24);
    const grid = canvas.getByRole("treegrid");
    await expect(
      grid.getBoundingClientRect().top - heading.getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(normalGap + 16);
    const actionsHeader = grid.querySelector(
      '.ag-header-cell[col-id="actions"]',
    );
    await expect(actionsHeader).not.toBeNull();
    await expect(actionsHeader!.textContent?.trim()).toBe("");
    await expect(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    ).not.toBeChecked();
    await expect(canvasElement.querySelector('[row-id="archived"]')).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Undo" }),
    ).not.toBeInTheDocument();
    await userEvent.hover(row);
    await expect(
      canvas.getByRole("button", { name: "Move Checking" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Archive Checking" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Delete Checking" }),
    ).toBeVisible();
    await expect(
      canvas.queryByText("Move To…", { exact: true }),
    ).not.toBeInTheDocument();
    await userEvent.unhover(row);
    const move = canvas.getByRole("button", { name: "Move Checking" });
    move.focus();
    await expect(move).toHaveFocus();
    await expect(move).toBeVisible();
  },
};

export const OrganizeArchiveUnarchiveAndDelete: Story = {
  args: { organizerApi: createOrganizerStoryApi() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const api = args.organizerApi!;
    const original = {
      archive: api.archive,
      unarchive: api.unarchive,
      delete: api.delete,
    };
    const archive = fn(api.archive);
    const unarchive = fn(api.unarchive);
    const remove = fn(api.delete);
    Object.assign(api, { archive, unarchive, delete: remove });
    try {
      const row = await lifecycleRow(canvasElement, "checking");
      await userEvent.click(
        row.querySelector<HTMLInputElement>(".ag-selection-checkbox input")!,
      );
      await userEvent.hover(row);
      await userEvent.click(
        canvas.getByRole("button", { name: "Archive Checking" }),
      );
      let dialog = within(
        await body.findByRole("dialog", { name: "Archive Account" }),
      );
      await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
      await expect(archive).not.toHaveBeenCalled();
      await userEvent.click(
        canvas.getByRole("button", { name: "Archive Checking" }),
      );
      dialog = within(
        await body.findByRole("dialog", { name: "Archive Account" }),
      );
      await userEvent.click(dialog.getByRole("button", { name: "Archive" }));
      await waitFor(() =>
        expect(canvasElement.querySelector('[row-id="checking"]')).toBeNull(),
      );
      await expect(
        canvas.queryByRole("toolbar", { name: "Organize Account Actions" }),
      ).not.toBeInTheDocument();
      await expect(
        canvas.getByRole("checkbox", { name: "Show Archived" }),
      ).not.toBeChecked();
      await expect(
        canvas.getByText(/Affected archived items are hidden/),
      ).toBeVisible();
      await userEvent.click(
        canvas.getByRole("checkbox", { name: "Show Archived" }),
      );
      const archived = await lifecycleRow(canvasElement, "checking");
      await expect(archived).toHaveTextContent("Archived");
      await userEvent.hover(archived);
      await userEvent.click(
        canvas.getByRole("button", { name: "Unarchive Checking" }),
      );
      await waitFor(() =>
        expect(
          canvas.getByRole("button", { name: "Archive Checking" }),
        ).toBeEnabled(),
      );
      await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
      await expect(
        canvas.getByRole("checkbox", { name: "Show Archived" }),
      ).toBeChecked();
      await userEvent.click(
        canvas.getByRole("button", { name: "Delete Checking" }),
      );
      const deletion = within(
        await body.findByRole("dialog", { name: "Delete Account" }),
      );
      await userEvent.click(deletion.getByRole("button", { name: "Delete" }));
      await waitFor(() =>
        expect(canvasElement.querySelector('[row-id="checking"]')).toBeNull(),
      );
      await expect(archive).toHaveBeenCalledTimes(1);
      await expect(unarchive).toHaveBeenCalledTimes(1);
      await expect(remove).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(canvas.getByRole("button", { name: "Done" })).toBeEnabled(),
      );
      await expect(
        canvasElement.querySelector(
          '[row-id="cash"] [col-id="ag-Grid-AutoColumn"]',
        ),
      ).toHaveFocus();
    } finally {
      Object.assign(api, original);
    }
  },
};

export const OrganizeHiddenChildrenPreventGroupDelete: Story = {
  args: {
    organizerApi: createOrganizerStoryApi(undefined, [
      ...organizeStoryNodes,
      {
        id: "archived-group",
        nodeType: "accountGroup",
        name: "Archive Only",
        parentId: null,
        sortOrder: 5,
        isActive: true,
        isCashAccount: false,
        unit: null,
      },
      {
        id: "hidden-child",
        nodeType: "account",
        name: "Hidden Child",
        parentId: "archived-group",
        sortOrder: 0,
        isActive: false,
        isCashAccount: false,
        unit: "CURRENCY",
      },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const group = await lifecycleRow(canvasElement, "archived-group");
    await userEvent.hover(group);
    await expect(
      canvas.getByRole("button", { name: "Archive Archive Only" }),
    ).toBeEnabled();
    const remove = canvas.getByRole("button", { name: "Delete Archive Only" });
    await expect(remove).toBeDisabled();
    await userEvent.hover(remove.parentElement!);
    await expect(await body.findByRole("tooltip")).toHaveTextContent(
      "contains accounts",
    );
    await expect(
      canvas.getByRole("button", { name: "Archive Investments" }),
    ).toBeDisabled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Archive Archive Only" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Archive Group" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Archive" }));
    await waitFor(() =>
      expect(
        canvasElement.querySelector('[row-id="archived-group"]'),
      ).toBeNull(),
    );
  },
};

export const OrganizeLifecycleRefreshRecovery: Story = {
  args: { organizerApi: createOrganizerStoryApi() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const api = args.organizerApi!;
    await lifecycleRow(canvasElement, "checking");
    const originalLoad = api.load;
    const originalArchive = api.archive;
    const archive = fn(api.archive);
    api.archive = archive;
    const load = fn(originalLoad)
      .mockRejectedValueOnce(new Error("Offline"))
      .mockRejectedValueOnce(new Error("Offline"));
    api.load = load;
    try {
      await userEvent.click(
        canvas.getByRole("button", { name: "Archive Checking" }),
      );
      const dialog = within(
        await body.findByRole("dialog", { name: "Archive Account" }),
      );
      await userEvent.click(dialog.getByRole("button", { name: "Archive" }));
      await waitFor(() =>
        expect(
          canvas.getByRole("button", { name: "Move Long-Term" }),
        ).toBeDisabled(),
      );
      await expect(
        await canvas.findByRole("button", { name: "Refresh Choices" }),
      ).toBeEnabled();
      await expect(
        canvas.getByRole("checkbox", { name: "Show Archived" }),
      ).toBeDisabled();
      await expect(archive).toHaveBeenCalledTimes(1);
      await expect(
        canvasElement.querySelector('[row-id="checking"]'),
      ).toBeNull();
      await userEvent.click(
        canvas.getByRole("button", { name: "Refresh Choices" }),
      );
      await waitFor(() =>
        expect(
          canvas.getByRole("checkbox", { name: "Show Archived" }),
        ).toBeEnabled(),
      );
      await expect(archive).toHaveBeenCalledTimes(1);
    } finally {
      api.load = originalLoad;
      api.archive = originalArchive;
    }
  },
};
