import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { AccountsPageView } from "../view";
import { AccountsPageStoryHarness } from "./harness";
const meta: Meta<typeof AccountsPageView> = {
  title: "Screens/Categories/Creation",
  component: AccountsPageView,
  parameters: { layout: "fullscreen", controls: { disable: true } },
};
export default meta;
type Story = StoryObj<typeof meta>;
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
    expect(
      within(row).queryByRole("button", { name: /^Add Expense Category/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(row).getByRole("button", { name: "Add Income Category Housing" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "New Category" }),
    );
    expect(dialog.getByLabelText("Category Group")).toHaveValue("Housing");
    expect(dialog.getByLabelText("Category Group")).toBeEnabled();
  },
};
