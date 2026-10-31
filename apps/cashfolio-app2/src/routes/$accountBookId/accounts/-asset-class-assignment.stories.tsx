import { AssetClassContext } from "@/classification-context";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AssetClassAssignmentDialog } from "./-asset-class-assignment";

const meta = {
  title: "Routes/Accounts/AssetClassAssignmentDialog",
  component: AssetClassAssignmentDialog,
  args: {
    target: { accountIds: ["first", "second"], archivedCount: 1 },
    onClose: fn(),
    onSubmit: fn(async (): Promise<void> => undefined),
  },
} satisfies Meta<typeof AssetClassAssignmentDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SubmissionGuards: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Set Asset Class" }),
    );
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    args.onSubmit.mockImplementationOnce(() => pending);
    await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
    await userEvent.click(dialog.getByLabelText("Asset Class"));
    await userEvent.click(body.getByRole("option", { name: "Equities" }));
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    try {
      await expect(
        dialog.getByRole("button", { name: "Cancel" }),
      ).toBeDisabled();
      await expect(dialog.getByLabelText("Asset Class")).toBeDisabled();
      await userEvent.keyboard("{Enter}{Escape}");
      await expect(args.onSubmit).toHaveBeenCalledTimes(1);
      await expect(args.onSubmit).toHaveBeenCalledWith("EQUITIES");
      await expect(args.onClose).not.toHaveBeenCalled();
      await expect(
        body.getByRole("dialog", { name: "Set Asset Class" }),
      ).toBeVisible();
    } finally {
      finish();
    }
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "Cancel" })).toBeEnabled(),
    );
  },
};

export const CustomNestedClass: Story = {
  decorators: [
    (Story) => (
      <AssetClassContext.Provider
        value={[
          { id: "root", name: "Investments", parentId: null, sortOrder: 0 },
          {
            id: "custom",
            name: "Swiss Shares",
            parentId: "root",
            sortOrder: 0,
          },
        ]}
      >
        <Story />
      </AssetClassContext.Provider>
    ),
  ],
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Set Asset Class" }),
    );
    await userEvent.click(dialog.getByLabelText("Asset Class"));
    await userEvent.type(dialog.getByLabelText("Asset Class"), "Swiss");
    await userEvent.click(
      body.getByRole("option", { name: "Investments / Swiss Shares" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledWith("custom"));
  },
};
