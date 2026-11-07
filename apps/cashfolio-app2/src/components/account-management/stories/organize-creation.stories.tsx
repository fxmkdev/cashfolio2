import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { createOrganizerStoryApi } from "@/components/hierarchy-organize/story-fixtures";
import { AccountsPageView } from "../page-view";
import { AccountsPageStoryHarness } from "./harness";
import { openRowActionsMenu } from "@/components/grid/row-actions-menu.story-helpers";
import { useState } from "react";
import type { AccountsPageViewProps } from "../page-view-types";
import { expandAssignmentGroup } from "./interaction-helpers";
import { organizeAccountNodes } from "./organize-action-fixtures";

const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
  parameters: {
    router: { initialPath: "/storybook-book/accounts?tab=BALANCE&mode=active" },
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

function CreationHarness({
  save,
  failRefresh = false,
}: {
  save?: AccountsPageViewProps["onSubmitCreateGroup"];
  failRefresh?: boolean;
}) {
  const [api] = useState(() =>
    createOrganizerStoryApi(undefined, organizeAccountNodes()),
  );
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

function ExistingEditHarness({
  save,
}: {
  save?: AccountsPageViewProps["onSubmitUpdateAccount"];
}) {
  const [api] = useState(() =>
    createOrganizerStoryApi(undefined, organizeAccountNodes()),
  );
  return (
    <AccountsPageStoryHarness
      initialMode="active"
      organizerApi={api}
      expandGroups
      organizeHistory
      submitUpdateAccount={async (values) => {
        await save?.(values);
        api.rename("account-checking", values.name!);
      }}
    />
  );
}

export const OrganizeRetainsAndRefreshesExistingEdit: Story = {
  render: () => <ExistingEditHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    await canvas.findByRole("region", { name: "Organize Accounts" });
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await canvas.findByRole("button", { name: "Organize" });
    const row = (
      await canvas.findByText("Checking", { exact: true })
    ).closest<HTMLElement>(".ag-row")!;
    const menu = await openRowActionsMenu(row);
    await userEvent.click(menu.getByRole("menuitem", { name: "Edit" }));
    const modal = await body.findByRole("dialog", { name: "Edit Account" });
    const dialog = within(modal);
    const name = dialog.getByRole("textbox", { name: /^Name/ });
    await userEvent.clear(name);
    await userEvent.type(name, "Retained Checking Draft");
    // Browser chrome can navigate while a modal covers the page's own controls.
    canvas.getByRole("button", { name: "Browser Forward" }).click();
    const region = within(
      await canvas.findByRole("region", { name: "Organize Accounts" }),
    );
    await expect(dialog.getByRole("textbox", { name: /^Name/ })).toBe(name);
    await expect(name).toHaveValue("Retained Checking Draft");
    await expect(canvas.getByRole("button", { name: "Done" })).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Add Account" }),
    ).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(modal).not.toBeInTheDocument());
    await expect(
      await region.findByText("Retained Checking Draft", { exact: true }),
    ).toBeVisible();
  },
};

export const NormalEditSubmissionQueuesOrganizeEntry: Story = {
  args: { onSubmitUpdateAccount: fn(async () => {}) },
  render: (args) => (
    <ExistingEditHarness
      save={(values) => args.onSubmitUpdateAccount(values)}
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
    args.onSubmitUpdateAccount = save;
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
      await canvas.findByRole("region", { name: "Organize Accounts" });
      await userEvent.click(canvas.getByRole("button", { name: "Done" }));
      await canvas.findByRole("button", { name: "Organize" });
      const row = (
        await canvas.findByText("Checking", { exact: true })
      ).closest<HTMLElement>(".ag-row")!;
      const menu = await openRowActionsMenu(row);
      await userEvent.click(menu.getByRole("menuitem", { name: "Edit" }));
      const dialog = within(
        await body.findByRole("dialog", { name: "Edit Account" }),
      );
      const name = dialog.getByRole("textbox", { name: /^Name/ });
      await userEvent.clear(name);
      await userEvent.type(name, "Saved Before Organizing");
      await userEvent.click(dialog.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(save).toHaveBeenCalledOnce());
      // Memory history only supports blockers for push/replace navigation.
      canvas.getByRole("button", { name: "Organize" }).click();
      await expect(
        canvas.queryByRole("region", { name: "Organize Accounts" }),
      ).not.toBeInTheDocument();
      await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
      release();
      const regionElement = await canvas.findByRole("region", {
        name: "Organize Accounts",
      });
      await expandAssignmentGroup(regionElement, "group-cash");
      await waitFor(() =>
        expect(
          within(regionElement).getByText("Saved Before Organizing", {
            exact: true,
          }),
        ).toBeVisible(),
      );
      await expect(save).toHaveBeenCalledOnce();
    } finally {
      release();
    }
  },
};
