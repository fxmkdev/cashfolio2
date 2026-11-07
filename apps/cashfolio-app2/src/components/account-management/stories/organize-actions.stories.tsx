import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { useState } from "react";
import { openRowActionsMenu } from "@/components/grid/row-actions-menu.story-helpers";
import {
  createOrganizerStoryApi,
  organizeStoryNodes,
} from "@/components/hierarchy-organize/story-fixtures";
import type { OrganizeNode } from "@/shared/account-organize/types";
import { AccountsPageView } from "../page-view";
import type { AccountsPageViewProps } from "../page-view-types";
import { AccountsPageStoryHarness } from "./harness";
import { activeAssetRows, archivedAssetRows } from "./fixtures";
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

function nodes(archived = false): OrganizeNode[] {
  return (archived ? archivedAssetRows : activeAssetRows).map((row) => ({
    id: row.id,
    name: row.name,
    nodeType: row.nodeType,
    parentId: row.parentId ?? null,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    isCashAccount: true,
    unit: row.unit,
  }));
}

function rowMoveStory(archived: boolean, assetClass: boolean): Story {
  return {
    args: { organizerApi: createOrganizerStoryApi(undefined, nodes(archived)) },
    render: (args) => (
      <AccountsPageStoryHarness
        initialMode={archived ? "archived" : "active"}
        organizerApi={args.organizerApi}
        initialGrouping={assetClass ? "assetClass" : "accountStructure"}
        expandGroups
        bulkAssignment
        routeSmoke
      />
    ),
    play: async ({ canvasElement, args }) => {
      const canvas = within(canvasElement),
        body = within(canvasElement.ownerDocument.body);
      const move = fn(args.organizerApi!.move);
      args.organizerApi!.move = move;
      const row = (
        await canvas.findByText("Checking", { exact: true })
      ).closest<HTMLElement>(".ag-row")!;
      const menu = await openRowActionsMenu(row);
      await userEvent.click(menu.getByRole("menuitem", { name: "Move To…" }));
      const dialog = within(
        await body.findByRole("dialog", { name: "Move To…" }),
      );
      await expect(
        canvas.queryByRole("region", { name: "Organize Accounts" }),
      ).not.toBeInTheDocument();
      await expect(canvas.getByTestId("router-search")).not.toHaveTextContent(
        '"organize":true',
      );
      // Moving an archived target includes archived groups in the destination tree.
      const destination = dialog.getByLabelText("Destination");
      await userEvent.click(destination);
      await userEvent.clear(destination);
      await userEvent.type(destination, "Cash");
      await expect(body.getByRole("option", { name: /Cash/ })).toBeVisible();
      await userEvent.clear(destination);
      await userEvent.type(destination, "Top Level");
      await userEvent.click(body.getByRole("option", { name: "Top Level" }));
      await userEvent.click(dialog.getByRole("button", { name: "Move" }));
      await waitFor(() =>
        expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      await expect(move).toHaveBeenCalledOnce();
      await expect(move.mock.calls[0][0].items).toEqual([
        expect.objectContaining({ id: "account-checking" }),
      ]);
      await expect(canvas.getByTestId("router-search")).not.toHaveTextContent(
        '"organize":true',
      );
      await expect(
        canvas.queryByRole("button", { name: "Move To…" }),
      ).not.toBeInTheDocument();
    },
  };
}
export const DefaultAccountMove: Story = rowMoveStory(false, false);
export const DefaultAssetClassAccountMove: Story = rowMoveStory(false, true);
export const DefaultArchivedAccountMove: Story = rowMoveStory(true, false);

function CreationHarness({
  save,
  failRefresh = false,
}: {
  save?: AccountsPageViewProps["onSubmitCreateGroup"];
  failRefresh?: boolean;
}) {
  const [api] = useState(() => createOrganizerStoryApi(undefined, nodes()));
  return (
    <AccountsPageStoryHarness
      initialMode="active"
      organizerApi={api}
      expandGroups
      submitCreateGroup={async (values) => {
        await save?.(values);
        if (failRefresh) {
          const load = api.load;
          let failures = 2;
          api.load = async () => {
            if (failures-- > 0) throw new Error("Offline");
            return load();
          };
        }
        api.create({
          id: "created-group",
          nodeType: "accountGroup",
          name: values.name!,
          parentId: values.parentGroupId ?? null,
          sortOrder: 10,
          isActive: true,
          isCashAccount: values.isCashAccount ?? false,
          unit: null,
        });
      }}
    />
  );
}

export const OrganizeCreationActions: Story = {
  render: () => <CreationHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    const region = within(
      await canvas.findByRole("region", { name: "Organize Accounts" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Add Account" }),
    ).toBeEnabled();
    await expect(
      canvas.getByRole("button", { name: "Add Group" }),
    ).toBeEnabled();
    await expect(
      region.queryByRole("button", { name: /^Edit / }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      region.getByRole("button", { name: "Add Account Cash" }),
    );
    let dialog = within(
      await body.findByRole("dialog", { name: "New Account" }),
    );
    await expect(dialog.getByLabelText("Group")).toHaveValue("Cash");
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await userEvent.click(
      region.getByRole("button", { name: "Add Group Cash" }),
    );
    dialog = within(await body.findByRole("dialog", { name: "New Group" }));
    await expect(dialog.getByLabelText("Parent Group")).toHaveValue("Cash");
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Name/ }),
      "New Cash Group",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await expect(
      await region.findByText("New Cash Group", { exact: true }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Add Group" }));
    dialog = within(await body.findByRole("dialog", { name: "New Group" }));
    await expect(dialog.getByLabelText("Parent Group")).toHaveValue("");
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  },
};

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

export const OrganizeCreationPendingAndRecovery: Story = {
  args: { onSubmitCreateGroup: fn(async () => {}) },
  render: (args) => (
    <CreationHarness
      save={(values) => args.onSubmitCreateGroup(values)}
      failRefresh
    />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const save = fn(async () => {
      await gate;
    });
    args.onSubmitCreateGroup = save;
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
      const region = within(
        await canvas.findByRole("region", { name: "Organize Accounts" }),
      );
      await userEvent.click(
        region.getByRole("button", { name: "Add Group Cash" }),
      );
      const dialog = within(
        await body.findByRole("dialog", { name: "New Group" }),
      );
      await userEvent.type(
        dialog.getByRole("textbox", { name: /^Name/ }),
        "Recovered Group",
      );
      await userEvent.click(dialog.getByRole("button", { name: "Create" }));
      await waitFor(() => expect(save).toHaveBeenCalledOnce());
      await expect(canvas.getByRole("button", { name: "Done" })).toBeDisabled();
      await expect(
        region.getByRole("checkbox", { name: "Show Archived" }),
      ).toBeDisabled();
      await expect(
        dialog.getByRole("button", { name: "Cancel" }),
      ).toBeDisabled();
      release();
      await waitFor(() =>
        expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      await expect(
        await region.findByRole("button", { name: "Refresh Choices" }),
      ).toBeEnabled();
      await expect(
        canvas.getByRole("button", { name: "Add Group" }),
      ).toBeDisabled();
      await userEvent.click(
        region.getByRole("button", { name: "Refresh Choices" }),
      );
      await expect(
        await region.findByText("Recovered Group", { exact: true }),
      ).toBeVisible();
      await expect(save).toHaveBeenCalledOnce();
      await expect(
        canvas.getByRole("button", { name: "Add Group" }),
      ).toBeEnabled();
    } finally {
      release();
    }
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
