import { Button, Stack } from "@mantine/core";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import {
  createAssetClassStoryApi,
  assetClassStoryNodes,
} from "@/components/hierarchy-organize/asset-class-story-fixtures";
import { row, select } from "@/components/hierarchy-organize/story-harness";
import { ClassificationsPageView } from "./-page-view";

function Harness({
  failFirstLoad = false,
  apiOverride,
  navigation = false,
}: {
  failFirstLoad?: boolean;
  apiOverride?: ReturnType<typeof createAssetClassStoryApi>;
  navigation?: boolean;
}) {
  const router = useRouter();
  const href = useRouterState({ select: (state) => state.location.href });
  const [api] = useState(() => {
    if (apiOverride) return apiOverride;
    const api = createAssetClassStoryApi();
    const load = api.load;
    let failed = false;
    api.load = async () => {
      if (failFirstLoad && !failed) {
        failed = true;
        throw new Error("Unavailable");
      }
      return load();
    };
    return api;
  });
  const [nodes, setNodes] = useState(assetClassStoryNodes);
  return (
    <Stack h={650}>
      {navigation && (
        <>
          <Button
            onClick={() =>
              void router.navigate({
                to: "/$accountBookId/settings/categories",
                params: { accountBookId: "storybook-book" },
                search: { tab: "EQUITY-INCOME", showArchived: false },
              })
            }
          >
            Navigate to Categories
          </Button>
          <output data-testid="history-href">{href}</output>
        </>
      )}
      <ClassificationsPageView
        accountBookId="storybook-book"
        nodes={nodes}
        organizerApi={api}
        onRefresh={async () => {
          const snapshot = await api.load();
          setNodes(
            snapshot.nodes.filter((node) => node.nodeType === "assetClass"),
          );
        }}
        onSave={(draft) => api.save(draft)}
        onDelete={async () => {}}
      />
    </Stack>
  );
}

const meta = {
  title: "Routes/Settings/Asset Classes/Hierarchy",
  component: Harness,
  parameters: {
    router: { initialPath: "/storybook-book/settings/classifications" },
  },
} satisfies Meta<typeof Harness>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MoveSubtreeAndDeleteWithReplacement: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const region = within(
      await canvas.findByRole("region", { name: "Asset Classes Hierarchy" }),
    );
    await expect(
      region.queryByRole("checkbox", { name: "Show Archived" }),
    ).not.toBeInTheDocument();
    await expect(
      region.queryByRole("columnheader", { name: "Status" }),
    ).not.toBeInTheDocument();
    await expect(
      region.queryByRole("columnheader", { name: "Type" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "New Asset Class" }),
    ).toBeVisible();
    await select(canvasElement, "equities");
    await userEvent.click(
      within(region.getByRole("toolbar")).getByRole("button", {
        name: "Move To…",
      }),
    );
    const move = within(await body.findByRole("dialog", { name: "Move To…" }));
    await waitFor(() =>
      expect(move.getByText(/1 included descendants/)).toBeVisible(),
    );
    await userEvent.click(move.getByLabelText("Destination"));
    await userEvent.click(await body.findByRole("option", { name: "Cash" }));
    await userEvent.click(move.getByRole("button", { name: "Move" }));
    await waitFor(async () =>
      expect(await row(canvasElement, "equities")).toHaveClass(
        "ag-row-level-1",
      ),
    );
    await userEvent.click(
      region.getByRole("button", {
        name: "Delete Swiss Equities",
      }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Delete Asset Class" }),
    );
    await waitFor(() =>
      expect(
        dialog.getByText(/2 active and 1 archived accounts/),
      ).toBeVisible(),
    );
    await userEvent.click(dialog.getByLabelText("Replacement Asset Class"));
    await userEvent.click(await body.findByRole("option", { name: "Cash" }));
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        region.queryByText("Swiss Equities", { exact: true }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      await canvas.findByRole("treegrid", {
        name: "Asset Classes",
      }),
    ).toBeVisible();
    await expect(
      canvas.getByText("2 active, 1 archived", { exact: true }),
    ).toBeVisible();
  },
};

export const FailedLoadRetry: Story = {
  args: { failFirstLoad: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Could not load the hierarchy.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Try Again" }));
    await canvas.findByRole("region", { name: "Asset Classes Hierarchy" });
  },
};

export const LegacyParameterDoesNotCreateMode: Story = {
  parameters: {
    router: {
      initialPath: "/storybook-book/settings/classifications?organize=true",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("region", { name: "Asset Classes Hierarchy" });
    await expect(
      canvas.queryByRole("button", { name: "Done" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Organize" }),
    ).not.toBeInTheDocument();
  },
};

export const DragIntoChildlessClass: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("region", { name: "Asset Classes Hierarchy" });
    const source = await row(canvasElement, "equities");
    const target = await row(canvasElement, "cash");
    const handle = source.querySelector<HTMLElement>(".ag-row-drag")!;
    const from = handle.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    await userEvent.hover(handle);
    await userEvent.pointer([
      {
        target: handle,
        coords: {
          clientX: from.x + from.width / 2,
          clientY: from.y + from.height / 2,
        },
        keys: "[MouseLeft>]",
      },
      {
        target,
        coords: { clientX: to.x + 180, clientY: to.y + to.height / 2 },
      },
      {
        target,
        coords: { clientX: to.x + 182, clientY: to.y + to.height / 2 },
      },
      {
        target,
        coords: { clientX: to.x + 182, clientY: to.y + to.height / 2 },
        keys: "[/MouseLeft]",
      },
    ]);
    await waitFor(async () =>
      expect(await row(canvasElement, "equities")).toHaveClass(
        "ag-row-level-1",
      ),
    );
    await waitFor(async () =>
      expect(await row(canvasElement, "swiss")).toHaveClass("ag-row-level-2"),
    );
  },
};

export const DirectActionsOnHoverAndFocus: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("region", { name: "Asset Classes Hierarchy" });
    const edit = await canvas.findByRole("button", { name: "Edit Cash" });
    const cell = edit.closest<HTMLElement>(".actions-cell")!;
    await userEvent.hover(
      canvas.getByRole("button", { name: "New Asset Class" }),
    );
    await waitFor(() => expect(cell).toHaveStyle({ opacity: "0" }));
    await userEvent.hover(await row(canvasElement, "cash"));
    await waitFor(() => expect(cell).toHaveStyle({ opacity: "1" }));
    await expect(
      canvas.queryByRole("button", { name: /^More Actions/ }),
    ).not.toBeInTheDocument();
    await userEvent.hover(
      canvas.getByRole("button", { name: "New Asset Class" }),
    );
    edit.focus();
    await waitFor(() => expect(cell).toHaveStyle({ opacity: "1" }));
    await userEvent.keyboard("{Enter}");
    const dialog = within(
      await body.findByRole("dialog", { name: "Edit Asset Class" }),
    );
    await expect(
      canvas.getByRole("button", { name: "New Asset Class" }),
    ).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Edit Cash" })).toHaveFocus(),
    );
  },
};

export const CommittedCreationRefreshRecovery: Story = {
  args: { apiOverride: createAssetClassStoryApi() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const api = args.apiOverride!;
    await canvas.findByRole("region", { name: "Asset Classes Hierarchy" });
    await userEvent.click(
      canvas.getByRole("button", { name: "New Asset Class" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "New Asset Class" }),
    );
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Name/ }),
      "New Class",
    );
    const load = api.load;
    const save = api.save;
    api.save = fn(save);
    api.load = async () => {
      throw new Error("Refresh unavailable");
    };
    try {
      await userEvent.click(dialog.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      await canvas.findByRole("button", { name: "Refresh Choices" });
      await expect(
        canvas.getByRole("button", { name: "New Asset Class" }),
      ).toBeDisabled();
      await expect(api.save).toHaveBeenCalledTimes(1);
      api.load = load;
      await userEvent.click(
        canvas.getByRole("button", { name: "Refresh Choices" }),
      );
      await waitFor(() =>
        expect(
          canvas.getByRole("button", { name: "New Asset Class" }),
        ).toBeEnabled(),
      );
      await expect(
        await canvas.findByText("New Class", { exact: true }),
      ).toBeVisible();
      await expect(api.save).toHaveBeenCalledTimes(1);
    } finally {
      api.load = load;
      api.save = save;
    }
  },
};

export const NavigationWaitsForEditorSave: Story = {
  args: { apiOverride: createAssetClassStoryApi(), navigation: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const api = args.apiOverride!;
    await canvas.findByRole("region", { name: "Asset Classes Hierarchy" });
    await userEvent.click(
      canvas.getByRole("button", { name: "New Asset Class" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "New Asset Class" }),
    );
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Name/ }),
      "Pending Class",
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const save = api.save;
    api.save = fn(async (draft) => {
      await gate;
      await save(draft);
    });
    try {
      await userEvent.click(dialog.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
      await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
      // Simulate a navigation request outside the modal focus trap.
      canvas.getByRole("button", { name: "Navigate to Categories" }).click();
      await userEvent.hover(dialog.getByRole("textbox", { name: /^Name/ }));
      await expect(canvas.getByTestId("history-href")).toHaveTextContent(
        "/settings/classifications",
      );
      release();
      await waitFor(() =>
        expect(canvas.getByTestId("history-href")).toHaveTextContent(
          "/settings/categories",
        ),
      );
      await expect(api.save).toHaveBeenCalledTimes(1);
    } finally {
      release();
      api.save = save;
    }
  },
};
