import { expect, userEvent, waitFor, within } from "storybook/test";
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
export const ExpenseCategories: Story = {
  parameters: {
    router: {
      initialPath:
        "/storybook-book/settings/categories?tab=EQUITY-EXPENSE&showArchived=false",
    },
  },
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialTab="EQUITY-EXPENSE"
      expandGroups
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      within(canvas.getByRole("tablist", { name: "Category Type" })).getByRole(
        "tab",
        { name: "Expenses" },
      ),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      canvas.getByText("Electricity", { exact: true }),
    ).toBeVisible();
    // Name scrolls while row actions remain pinned, including on mobile.
    await expect(
      canvasElement.querySelector(
        '.ag-grid-scrolling-cells [col-id="ag-Grid-AutoColumn"]',
      ),
    ).toBeVisible();
    await expect(
      canvasElement.querySelector(
        '.ag-grid-pinned-right-cells [col-id="actions"]',
      ),
    ).toBeVisible();
    const body = within(canvasElement.ownerDocument.body);
    for (const [name, reason] of [
      ["Electricity", "Cannot delete category because it has bookings"],
      [
        "Housing",
        "Cannot delete category group because it contains categories",
      ],
    ]) {
      const row = canvas
        .getByText(name, { exact: true })
        .closest<HTMLElement>(".ag-row");
      if (!row) throw new Error(`Missing ${name} row`);
      const deleteButton = within(row).getByRole("button", { name: "Delete" });
      await expect(deleteButton).toBeDisabled();
      const trigger = deleteButton.parentElement!;
      trigger.scrollIntoView({ block: "nearest", inline: "nearest" });
      await userEvent.hover(trigger);
      await waitFor(() =>
        expect(body.getByRole("tooltip")).toHaveTextContent(reason),
      );
      await userEvent.unhover(trigger);
      await waitFor(() =>
        expect(body.queryByRole("tooltip")).not.toBeInTheDocument(),
      );
    }
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Expense Category" }),
    );
    await findVisibleDialog(
      within(canvasElement.ownerDocument.body),
      "New Category",
    );
  },
};

export const CategoriesWithArchived: Story = {
  parameters: {
    router: {
      initialPath:
        "/storybook-book/settings/categories?tab=EQUITY-EXPENSE&showArchived=true",
    },
  },
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialTab="EQUITY-EXPENSE"
      expandGroups
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const visibility = canvas.getByRole("checkbox", { name: "Show Archived" });
    await expect(visibility).toBeChecked();
    for (const label of await canvas.findAllByText("Archived", {
      exact: true,
    })) {
      expect(label.closest('[role="row"]')).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
    await expect(
      canvas.getByRole("button", { name: "Add Expense Category" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("navigation", { name: "Category Archive" }),
    ).not.toBeInTheDocument();
    await userEvent.hover(canvas.getAllByText("Archived", { exact: true })[0]);
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("tooltip"),
    ).toHaveTextContent(
      "Archived categories grouped automatically. Their transaction history is preserved.",
    );
    await userEvent.click(visibility);
    await waitFor(() =>
      expect(canvas.queryAllByText("Archived", { exact: true })).toHaveLength(
        0,
      ),
    );
    await expect(visibility).not.toBeChecked();
  },
};

export const CategoriesMobile: Story = {
  ...ExpenseCategories,
  parameters: {
    ...ExpenseCategories.parameters,
    viewport: { defaultViewport: "cashfolioMobile" },
  },
};

export const IncomeCategories: Story = {
  parameters: {
    router: {
      initialPath:
        "/storybook-book/settings/categories?tab=EQUITY-INCOME&showArchived=false",
    },
  },
  render: () => (
    <AccountsPageStoryHarness initialMode="active" initialTab="EQUITY-INCOME" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      within(
        canvas.getByRole("tablist", { name: "Account Book Settings" }),
      ).getByRole("tab", { name: "Categories" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      within(canvas.getByRole("tablist", { name: "Category Type" })).getByRole(
        "tab",
        { name: "Income" },
      ),
    ).toHaveAttribute("aria-selected", "true");
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Income Category" }),
    );
    await findVisibleDialog(
      within(canvasElement.ownerDocument.body),
      "New Category",
    );
  },
};

export const CategoriesWithArchivedMobile: Story = {
  ...CategoriesWithArchived,
  parameters: {
    ...CategoriesWithArchived.parameters,
    viewport: { defaultViewport: "cashfolioMobile" },
  },
};
