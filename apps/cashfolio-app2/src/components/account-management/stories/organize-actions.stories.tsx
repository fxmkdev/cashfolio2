import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import {
  createOrganizerStoryApi,
  organizeStoryNodes,
} from "@/components/hierarchy-organize/story-fixtures";
import { AccountsPageView } from "../page-view";
import { AccountsPageStoryHarness } from "./harness";
import {
  selectAssignmentAccount,
  expandAssignmentGroup,
} from "./interaction-helpers";

const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
  parameters: {
    router: { initialPath: "/storybook-book/accounts?tab=BALANCE&mode=active" },
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const OrganizeBulkLifecycleActions: Story = {
  args: { organizerApi: createOrganizerStoryApi() },
  render: (args) => (
    <AccountsPageStoryHarness
      initialMode="active"
      organizerApi={args.organizerApi}
    />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    const api = args.organizerApi!;
    const archive = fn(api.archiveMany),
      remove = fn(api.deleteMany);
    api.archiveMany = archive;
    api.deleteMany = remove;
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    const regionElement = await canvas.findByRole("region", {
      name: "Organize Accounts",
    });
    const region = within(regionElement);
    await selectAssignmentAccount(regionElement, "checking");
    await selectAssignmentAccount(regionElement, "empty");
    let toolbar = within(
      region.getByRole("toolbar", { name: "Organize Account Actions" }),
    );
    await expect(toolbar.getByRole("status")).toHaveTextContent(
      "1 group and 1 account selected",
    );
    await userEvent.click(toolbar.getByRole("button", { name: "Archive" }));
    let dialog = within(
      await body.findByRole("dialog", { name: "Archive Selected Items" }),
    );
    await expect(dialog.getByText(/Checking/)).toHaveTextContent("Empty Group");
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await expect(archive).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await userEvent.click(toolbar.getByRole("button", { name: "Archive" }));
    dialog = within(
      await body.findByRole("dialog", { name: "Archive Selected Items" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Archive" }));
    await waitFor(() =>
      expect(regionElement.querySelector('[row-id="checking"]')).toBeNull(),
    );
    await expect(archive).toHaveBeenCalledOnce();
    await expect(
      region.getByText(/Affected archived items are hidden/),
    ).toBeVisible();
    await expect(
      region.getByRole("checkbox", { name: "Show Archived" }),
    ).not.toBeChecked();
    await userEvent.click(
      region.getByRole("checkbox", { name: "Show Archived" }),
    );
    await selectAssignmentAccount(regionElement, "checking");
    await selectAssignmentAccount(regionElement, "empty");
    toolbar = within(
      region.getByRole("toolbar", { name: "Organize Account Actions" }),
    );
    await expect(
      toolbar.getByRole("button", { name: "Unarchive" }),
    ).toBeEnabled();
    await expect(
      toolbar.queryByRole("button", { name: "Archive" }),
    ).not.toBeInTheDocument();
    await userEvent.click(toolbar.getByRole("button", { name: "Delete" }));
    dialog = within(
      await body.findByRole("dialog", { name: "Delete Selected Items" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(regionElement.querySelector('[row-id="empty"]')).toBeNull(),
    );
    await expect(remove).toHaveBeenCalledOnce();
    await selectAssignmentAccount(regionElement, "investments");
    await selectAssignmentAccount(regionElement, "nested");
    toolbar = within(
      region.getByRole("toolbar", { name: "Organize Account Actions" }),
    );
    await expect(toolbar.getByRole("status")).toHaveTextContent(
      "2 groups and 0 accounts selected",
    );
    await expect(
      toolbar.getByRole("button", { name: "Archive" }),
    ).toBeDisabled();
    await expect(
      toolbar.getByRole("button", { name: "Delete" }),
    ).toBeDisabled();
    await expect(
      toolbar.getByRole("button", { name: "Delete" }),
    ).toHaveAttribute("aria-description", expect.stringContaining("Fund"));
  },
};

export const OrganizeBulkUnarchive: Story = {
  args: {
    organizerApi: createOrganizerStoryApi(undefined, [
      ...organizeStoryNodes.map((node) => ({
        ...node,
        isActive: ["checking", "empty", "nested", "holding"].includes(node.id)
          ? false
          : node.isActive,
      })),
      {
        id: "untouched",
        nodeType: "account",
        name: "Untouched Sibling",
        parentId: "nested",
        sortOrder: 10,
        isActive: false,
        isCashAccount: false,
        unit: "CURRENCY",
      },
    ]),
  },
  render: (args) => (
    <AccountsPageStoryHarness
      initialMode="active"
      organizerApi={args.organizerApi}
    />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    const unarchive = fn(args.organizerApi!.unarchiveMany);
    args.organizerApi!.unarchiveMany = unarchive;
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    const regionElement = await canvas.findByRole("region", {
      name: "Organize Accounts",
    });
    const region = within(regionElement);
    await userEvent.click(
      region.getByRole("checkbox", { name: "Show Archived" }),
    );
    await selectAssignmentAccount(regionElement, "checking");
    let toolbar = within(
      region.getByRole("toolbar", { name: "Organize Account Actions" }),
    );
    await expect(
      toolbar.getByRole("button", { name: "Unarchive" }),
    ).toBeEnabled();
    await expect(
      toolbar.queryByRole("button", { name: "Archive" }),
    ).not.toBeInTheDocument();
    await selectAssignmentAccount(regionElement, "empty");
    await expect(
      toolbar.getByRole("button", { name: "Unarchive" }),
    ).toBeEnabled();
    await selectAssignmentAccount(regionElement, "destination");
    await expect(
      toolbar.getByRole("button", { name: "Archive" }),
    ).toBeDisabled();
    await expect(
      toolbar.queryByRole("button", { name: "Unarchive" }),
    ).not.toBeInTheDocument();
    await selectAssignmentAccount(regionElement, "destination");
    await userEvent.click(toolbar.getByRole("button", { name: "Unarchive" }));
    await waitFor(() =>
      expect(toolbar.getByRole("button", { name: "Archive" })).toBeEnabled(),
    );
    await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(unarchive).toHaveBeenCalledOnce();
    await expect(
      unarchive.mock.calls[0][0].map((item) => item.id).sort(),
    ).toEqual(["checking", "empty"]);
    await expect(
      region.getByRole("checkbox", { name: "Show Archived" }),
    ).toBeChecked();
    await userEvent.click(
      toolbar.getByRole("button", { name: "Clear Selection" }),
    );
    await selectAssignmentAccount(regionElement, "nested");
    toolbar = within(
      region.getByRole("toolbar", { name: "Organize Account Actions" }),
    );
    await expect(
      toolbar.getByRole("button", { name: "Unarchive" }),
    ).toBeEnabled();
    await expandAssignmentGroup(regionElement, "nested");
    await selectAssignmentAccount(regionElement, "holding");
    await expect(
      toolbar.getByRole("button", { name: "Unarchive" }),
    ).toBeEnabled();
    await selectAssignmentAccount(regionElement, "nested");
    await expect(
      toolbar.getByRole("button", { name: "Unarchive" }),
    ).toBeDisabled();
    await expect(
      toolbar.getByRole("button", { name: "Unarchive" }),
    ).toHaveAttribute("aria-description", expect.stringContaining("Brokerage"));
    await selectAssignmentAccount(regionElement, "nested");
    await userEvent.click(toolbar.getByRole("button", { name: "Unarchive" }));
    await waitFor(() =>
      expect(toolbar.getByRole("button", { name: "Archive" })).toBeEnabled(),
    );
    await expect(unarchive).toHaveBeenCalledTimes(2);
    await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(
      region.getByRole("button", { name: "Unarchive Untouched Sibling" }),
    ).toBeEnabled();
    await expect(
      region.getByRole("button", { name: "Archive Fund" }),
    ).toBeEnabled();
  },
};

export const OrganizeCollectiveArchiveAndDelete: Story = {
  args: { organizerApi: createOrganizerStoryApi() },
  render: (args) => (
    <AccountsPageStoryHarness
      initialMode="active"
      organizerApi={args.organizerApi}
    />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    const archive = fn(args.organizerApi!.archiveMany),
      remove = fn(args.organizerApi!.deleteMany);
    args.organizerApi!.archiveMany = archive;
    args.organizerApi!.deleteMany = remove;
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    const regionElement = await canvas.findByRole("region", {
      name: "Organize Accounts",
    });
    const region = within(regionElement);
    await selectAssignmentAccount(regionElement, "investments");
    let toolbar = within(
      region.getByRole("toolbar", { name: "Organize Account Actions" }),
    );
    await expect(
      toolbar.getByRole("button", { name: "Archive" }),
    ).toBeDisabled();
    await expect(
      toolbar.getByRole("button", { name: "Archive" }),
    ).toHaveAttribute("aria-description", expect.stringContaining("Brokerage"));
    await selectAssignmentAccount(regionElement, "nested");
    await expandAssignmentGroup(regionElement, "nested");
    await selectAssignmentAccount(regionElement, "holding");
    await expect(
      toolbar.getByRole("button", { name: "Archive" }),
    ).toBeEnabled();
    await userEvent.click(toolbar.getByRole("button", { name: "Archive" }));
    let dialog = within(
      await body.findByRole("dialog", { name: "Archive Selected Items" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Archive" }));
    await waitFor(() =>
      expect(regionElement.querySelector('[row-id="investments"]')).toBeNull(),
    );
    await expect(archive).toHaveBeenCalledOnce();
    await userEvent.click(
      region.getByRole("checkbox", { name: "Show Archived" }),
    );
    await selectAssignmentAccount(regionElement, "investments");
    await selectAssignmentAccount(regionElement, "nested");
    await selectAssignmentAccount(regionElement, "holding");
    toolbar = within(
      region.getByRole("toolbar", { name: "Organize Account Actions" }),
    );
    await expect(
      toolbar.getByRole("button", { name: "Delete" }),
    ).toBeDisabled();
    await expect(
      toolbar.getByRole("button", { name: "Delete" }),
    ).toHaveAttribute("aria-description", expect.stringContaining("Old Fund"));
    await selectAssignmentAccount(regionElement, "archived");
    await expect(toolbar.getByRole("button", { name: "Delete" })).toBeEnabled();
    await userEvent.click(toolbar.getByRole("button", { name: "Delete" }));
    dialog = within(
      await body.findByRole("dialog", { name: "Delete Selected Items" }),
    );
    await waitFor(() =>
      expect(dialog.getByText(/2 groups and 2 accounts/)).toBeVisible(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(regionElement.querySelector('[row-id="investments"]')).toBeNull(),
    );
    await expect(remove).toHaveBeenCalledOnce();
    await expect(
      region.getByRole("button", { name: "Archive Checking" }),
    ).toBeEnabled();
  },
};
