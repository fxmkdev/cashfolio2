import { expect, userEvent, waitFor, within } from "storybook/test";
import { findVisibleDialog } from "./interaction-helpers";
import { AccountsPageStoryHarness } from "./harness";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountsPageView } from "../page-view";
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
    const utilities = await canvas.findByText("Utilities", { exact: true });
    const expander = utilities
      .closest(".ag-row")
      ?.querySelector<HTMLElement>(".ag-group-contracted");
    if (expander) await userEvent.click(expander);
    await waitFor(() =>
      expect(canvas.getByText("Electricity", { exact: true })).toBeVisible(),
    );
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
      await userEvent.hover(row);
      const deleteItem = within(row).getByRole("button", {
        name: new RegExp(`^Delete ${name}$`),
      });
      await expect(deleteItem).toBeDisabled();
      await expect(deleteItem).toHaveAccessibleDescription(reason);
      await userEvent.hover(deleteItem);
      await waitFor(() =>
        expect(body.getByRole("tooltip")).toHaveTextContent(reason),
      );
      await userEvent.unhover(deleteItem);
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(body.queryByRole("menu")).not.toBeInTheDocument(),
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
    await waitFor(() =>
      expect(canvas.getByText("Old Category", { exact: true })).toBeVisible(),
    );
    expect(canvasElement.querySelector('[row-id^="__archived__:"]')).toBeNull();
    await expect(
      canvas.getByRole("button", { name: "Add Expense Category" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("navigation", { name: "Category Archive" }),
    ).not.toBeInTheDocument();
    await userEvent.click(visibility);
    await waitFor(() =>
      expect(
        canvas.queryByText("Old Category", { exact: true }),
      ).not.toBeInTheDocument(),
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
