import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  createOrganizerStoryApi,
  organizeStoryNodes,
} from "@/components/hierarchy-organize/story-fixtures";
import { AccountsPageView } from "../view";
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
  title: "Screens/Categories/Organize",
  component: AccountsPageView,
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
    router: {
      initialPath:
        "/storybook-book/settings/categories?tab=EQUITY-EXPENSE&showArchived=false",
    },
  },
  render: (args) => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialTab="EQUITY-EXPENSE"
      organizerApi={args.organizerApi ?? categoryApi()}
      expandGroups
    />
  ),
};
export default meta;
type Story = StoryObj<typeof meta>;

export const CategoryActionsAndTabChange: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const region = within(
      await canvas.findByRole("region", { name: "Categories Hierarchy" }),
    );
    await expect(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    ).not.toBeChecked();
    await expect(
      canvas.queryByRole("button", { name: "Add Expense Category" }),
    ).toBeVisible();
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
      canvas.getByRole("region", { name: "Categories Hierarchy" }),
    ).toBeVisible();
  },
  name: "Category Actions And Tab Change Interaction Test",
  tags: ["regression", "!autodocs"],
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
    await canvas.findByRole("region", { name: "Categories Hierarchy" });
    await expect(
      await canvas.findByRole("button", { name: "Add Expense Category" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    ).toBeChecked();
  },
};

export const CategoryMutationFailureUsesCategoryWordingView: Story = {
  args: {
    organizerApi: {
      ...categoryApi(),
      archive: async () => {
        throw new Error("This account is no longer available.");
      },
    },
  },
  name: "Category Mutation Failure Uses Category Wording Playground",
  tags: ["!regression"],
  play: undefined,
};

export const CategoryMutationFailureUsesCategoryWording: Story = {
  ...CategoryMutationFailureUsesCategoryWordingView,
  name: "Category Mutation Failure Uses Category Wording Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Archive Electricity" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Archive Category" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Archive" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "This category is no longer available.",
    );
    await expect(
      canvas.getByRole("button", { name: "Archive Electricity" }),
    ).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  },
};
