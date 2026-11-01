import { useRef, useState } from "react";
import { Text } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  AssetClassProvider,
  useRefreshAssetClasses,
} from "./classification-context";
import {
  EditAccountModal,
  type TransformedFormValues,
} from "./components/account-editor/edit-account-modal";
import {
  accountGroupOptions,
  editAccountInitialValues,
  existingNodes,
} from "./components/testing/storybook-fixtures";

const initialNodes = [
  { id: "old", name: "Old Class", parentId: null, sortOrder: 0 },
];
const updatedNodes = [
  { id: "new", name: "New Class", parentId: null, sortOrder: 0 },
];
function DraftEditor() {
  const refresh = useRefreshAssetClasses();
  const failOnce = useRef(true);
  const [opened, setOpened] = useState(true);
  const [submitted, setSubmitted] = useState<TransformedFormValues>();
  return (
    <>
      <EditAccountModal
        opened={opened}
        onClose={() => setOpened(false)}
        accountGroups={accountGroupOptions}
        existingNodes={existingNodes}
        editingId="account-checking"
        typeDescriptor="BALANCE"
        initialValues={{ ...editAccountInitialValues, assetClassId: "old" }}
        onRefreshConstraints={refresh}
        onSubmit={async (values) => {
          if (failOnce.current) {
            failOnce.current = false;
            throw new Error("The selected asset class is no longer available.");
          }
          setSubmitted(values);
          setOpened(false);
        }}
      />
      <Text data-testid="submitted-classification">
        {submitted
          ? `${submitted.name}: ${submitted.assetClassId}`
          : "Not Saved"}
      </Text>
    </>
  );
}
const meta = {
  title: "Components/AssetClassProvider",
  component: AssetClassProvider,
  args: {
    nodes: initialNodes,
    loadNodes: async () => updatedNodes,
    children: <DraftEditor />,
  },
} satisfies Meta<typeof AssetClassProvider>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RefreshPreservesEditorDraft: Story = {
  render: (args) => <AssetClassProvider {...args} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Edit Account" }),
    );
    const name = dialog.getByRole("textbox", { name: /^Name/ });
    await userEvent.clear(name);
    await userEvent.type(name, "Unsaved Draft");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "no longer available",
    );
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled(),
    );
    expect(name).toHaveValue("Unsaved Draft");
    const selector = dialog.getByRole("textbox", { name: "Asset Class" });
    await userEvent.click(selector);
    expect(
      body.getByRole("option", { name: "Old Class (no longer available)" }),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.clear(selector);
    expect(
      body.queryByRole("option", { name: "Old Class" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      await body.findByRole("option", { name: "New Class" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        within(canvasElement).getByTestId("submitted-classification"),
      ).toHaveTextContent("Unsaved Draft: new"),
    );
  },
};
