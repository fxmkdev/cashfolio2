import { Button, Text } from "@mantine/core";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useAccountsPageModalState } from "../-page-modal-state";
import { findVisibleDialog } from "./interaction-helpers";
import { AccountsPageStoryHarness } from "./harness";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountsPageView } from "../-page-view";
const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
};
export default meta;
type Story = StoryObj<typeof meta>;
function CreationScopeHarness() {
  const [scope, setScope] = useState("book-one:INCOME");
  const state = useAccountsPageModalState(scope);
  return (
    <>
      <Button
        onClick={() => {
          state.openCreateAccount("parent");
          state.openCreateGroup("parent");
        }}
      >
        Open Contextual Creation
      </Button>
      <Button onClick={() => setScope("book-one:EXPENSE")}>Change Tab</Button>
      <Button onClick={() => setScope("book-two:EXPENSE")}>Change Book</Button>
      <Text data-testid="creation-state">
        {JSON.stringify([
          state.createModalOpened,
          state.createAccountGroupId,
          state.createGroupModalOpened,
          state.createGroupParentId,
        ])}
      </Text>
    </>
  );
}

export const CreateModalOpen: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      startWithCreateModal={true}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: "New Account" });
    expect(
      within(dialog).queryByRole("combobox", { name: "Type" }),
    ).not.toBeInTheDocument();
    expect(
      within(canvasElement).queryByRole("tablist"),
    ).not.toBeInTheDocument();
  },
};

export const EditModalOpen: Story = {
  render: () => (
    <AccountsPageStoryHarness initialMode="active" startWithEditModal={true} />
  ),
};

export const AssetClassHelpEscapePreservesDraft: Story = {
  render: () => (
    <AccountsPageStoryHarness initialMode="active" startWithEditModal={true} />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await findVisibleDialog(body, "Edit Account");
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    const helpButton = within(dialog).getByRole("button", {
      name: "Show Asset Class Help",
    });
    const draftName = "Unsaved Checking Account";

    await userEvent.clear(name);
    await userEvent.type(name, draftName);

    for (const activation of ["click", "keyboard"] as const) {
      if (activation === "click") {
        await userEvent.click(helpButton);
      } else {
        await expect(helpButton).toHaveFocus();
        await userEvent.keyboard("{Enter}");
      }

      const help = await body.findByRole("dialog", {
        name: "Show Asset Class Help",
      });
      await waitFor(() => expect(help).toHaveFocus());
      if (activation === "keyboard") {
        // Also cover Escape when focus is still on the popover trigger.
        helpButton.focus();
      }
      await userEvent.keyboard("{Escape}");

      await waitFor(() => expect(help).not.toBeInTheDocument());
      await expect(dialog).toBeVisible();
      await expect(name).toHaveValue(draftName);
      await waitFor(() => expect(helpButton).toHaveFocus());
    }

    for (const dismissTarget of [helpButton, name]) {
      await userEvent.click(helpButton);
      const help = await body.findByRole("dialog", {
        name: "Show Asset Class Help",
      });
      await waitFor(() => expect(help).toHaveFocus());
      await userEvent.click(dismissTarget);
      await waitFor(() => expect(help).not.toBeInTheDocument());
      await expect(dialog).toBeVisible();
      await expect(name).toHaveValue(draftName);
    }

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  },
};

export const ContextualAccountCreation: Story = {
  render: () => <AccountsPageStoryHarness initialMode="active" expandGroups />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    const cash = await canvas.findByText("Cash", { exact: true });
    await userEvent.hover(cash.closest<HTMLElement>(".ag-row")!);
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Child to Cash" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Add Account" }),
    );
    let dialog = within(
      await body.findByRole("dialog", { name: "New Account" }),
    );
    expect(dialog.getByLabelText("Group")).toHaveValue("Cash");
    expect(dialog.getByLabelText("Tracking Method")).toHaveValue(
      "Individual Units",
    );
    expect(dialog.getByLabelText("Group")).toBeEnabled();
    expect(
      dialog.getByRole("checkbox", { name: "Include in Cash Flow" }),
    ).toBeChecked();
    expect(
      dialog.getByRole("checkbox", { name: "Include in Cash Flow" }),
    ).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Account" }));
    dialog = within(await body.findByRole("dialog", { name: "New Account" }));
    expect(dialog.getByLabelText("Group")).toHaveValue("");
    expect(dialog.getByLabelText("Tracking Method")).toHaveValue(
      "Individual Units",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await userEvent.hover(cash.closest<HTMLElement>(".ag-row")!);
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Child to Cash" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Add Group" }),
    );
    dialog = within(await body.findByRole("dialog", { name: "New Group" }));
    expect(dialog.getByLabelText("Parent Group")).toHaveValue("Cash");
    expect(
      dialog.getByRole("checkbox", { name: "Include in Cash Flow" }),
    ).toBeChecked();
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Name/ }),
      "New Cash Group",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Group" }));
    dialog = within(await body.findByRole("dialog", { name: "New Group" }));
    expect(dialog.getByLabelText("Parent Group")).toHaveValue("");
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    const leaf = (
      await canvas.findByText("Checking", { exact: true })
    ).closest<HTMLElement>(".ag-row")!;
    expect(
      within(leaf).queryByRole("button", { name: /^Add Child/ }),
    ).not.toBeInTheDocument();
    expect(
      canvasElement.querySelector('.ag-row-pinned [aria-label^="Add Child"]'),
    ).toBeNull();
  },
};

export const ContextualIncomeCategoryCreation: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialTab="EQUITY-INCOME"
      expandGroups
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    const row = (
      await canvas.findByText("Housing", { exact: true })
    ).closest<HTMLElement>(".ag-row")!;
    await userEvent.hover(row);
    await userEvent.click(
      within(row).getByRole("button", { name: "Add Child to Housing" }),
    );
    await waitFor(() =>
      expect(
        body.getByRole("menuitem", { name: "Add Income Category" }),
      ).toBeVisible(),
    );
    expect(
      body.queryByRole("menuitem", { name: "Add Expense Category" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      body.getByRole("menuitem", { name: "Add Income Category" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "New Category" }),
    );
    expect(dialog.getByLabelText("Category Group")).toHaveValue("Housing");
    expect(dialog.getByLabelText("Category Group")).toBeEnabled();
  },
};

export const CreationDefaultsResetOnBookAndTabChanges: Story = {
  render: () => <CreationScopeHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const action of ["Change Tab", "Change Book"]) {
      await userEvent.click(
        canvas.getByRole("button", { name: "Open Contextual Creation" }),
      );
      expect(canvas.getByTestId("creation-state")).toHaveTextContent(
        '[true,"parent",true,"parent"]',
      );
      await userEvent.click(canvas.getByRole("button", { name: action }));
      await waitFor(() =>
        expect(canvas.getByTestId("creation-state")).toHaveTextContent(
          "[false,null,false,null]",
        ),
      );
    }
  },
};
