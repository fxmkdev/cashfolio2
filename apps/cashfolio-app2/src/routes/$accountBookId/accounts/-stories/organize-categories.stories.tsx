import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  createOrganizerStoryApi,
  organizeStoryNodes,
} from "@/components/hierarchy-organize/story-fixtures";
import { AccountsPageView } from "../-page-view";
import { AccountsPageStoryHarness } from "./harness";

function categoryApi() {
  const names: Record<string, string> = {
    checking: "Electricity",
    investments: "Housing",
    destination: "Other Expenses",
    holding: "Water",
    archived: "Old Utility",
  };
  return {
    ...createOrganizerStoryApi(
      undefined,
      organizeStoryNodes.map((node) => ({
        ...node,
        name: names[node.id] ?? node.name,
        unit: null,
        isCashAccount: false,
      })),
    ),
    kind: "categories" as const,
  };
}
const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/Categories/Organize",
  component: AccountsPageView,
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
      organizerApi={categoryApi()}
      expandGroups
    />
  ),
};
export default meta;
type Story = StoryObj<typeof meta>;

export const CategoryActionsAndTabExit: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    const region = within(
      await canvas.findByRole("region", { name: "Organize Categories" }),
    );
    await expect(
      region.getByRole("checkbox", { name: "Show Archived" }),
    ).not.toBeChecked();
    await expect(
      canvas.queryByRole("button", { name: "Add Expense Category" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      region.getByRole("button", { name: "Archive Electricity" }),
    );
    const dialog = within(
      await body.findByRole("dialog", {
        name: "Archive Category",
      }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Archive" }));
    await waitFor(() =>
      expect(
        region.queryByRole("button", { name: "Move Electricity" }),
      ).not.toBeInTheDocument(),
    );
    await userEvent.click(canvas.getByRole("tab", { name: "Income" }));
    await expect(
      await canvas.findByRole("button", {
        name: "Add Income Category",
      }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("region", { name: "Organize Categories" }),
    ).not.toBeInTheDocument();
  },
};

export const DirectCategoryEntry: Story = {
  parameters: {
    router: {
      initialPath:
        "/storybook-book/settings/categories?tab=EQUITY-EXPENSE&showArchived=true&organize=true",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("region", { name: "Organize Categories" });
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await expect(
      await canvas.findByRole("button", { name: "Add Expense Category" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    ).toBeChecked();
  },
};
