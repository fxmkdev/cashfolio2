import { Stack } from "@mantine/core";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  createAssetClassStoryApi,
  assetClassStoryNodes,
} from "@/components/hierarchy-organize/asset-class-story-fixtures";
import { row, select } from "@/components/hierarchy-organize/story-harness";
import { ClassificationsPageView } from "./-page-view";

function Harness({ failFirstLoad = false }: { failFirstLoad?: boolean }) {
  const [api] = useState(() => {
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
  const organize = useRouterState({
    select: (state) => state.location.search.organize === true,
  });
  const router = useRouter();
  return (
    <Stack h={650}>
      <ClassificationsPageView
        accountBookId="storybook-book"
        nodes={nodes}
        organize={organize}
        organizerApi={api}
        onRefresh={async () => {
          const snapshot = await api.load();
          setNodes(
            snapshot.nodes.filter((node) => node.nodeType === "assetClass"),
          );
        }}
        onSave={async () => {}}
        onDelete={async () => {}}
      />
      <button onClick={() => router.history.back()}>Browser Back</button>
      <button onClick={() => router.history.forward()}>Browser Forward</button>
    </Stack>
  );
}

const meta = {
  title: "Routes/Settings/Asset Classes/Organize",
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
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    const region = within(
      await canvas.findByRole("region", { name: "Organize Asset Classes" }),
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
    ).not.toBeInTheDocument();
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
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
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

export const FailedEntryRetryAndBrowserHistory: Story = {
  args: { failFirstLoad: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Could not load the hierarchy.",
    );
    await expect(
      canvas.getByRole("treegrid", { name: "Asset Classes" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Try Again" }));
    await canvas.findByRole("region", { name: "Organize Asset Classes" });
    await userEvent.click(canvas.getByRole("button", { name: "Browser Back" }));
    await waitFor(() =>
      expect(
        canvas.queryByRole("region", { name: "Organize Asset Classes" }),
      ).not.toBeInTheDocument(),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Browser Forward" }),
    );
    await canvas.findByRole("region", { name: "Organize Asset Classes" });
    await expect(
      canvas.queryByRole("toolbar", { name: "Organize Asset Class Actions" }),
    ).not.toBeInTheDocument();
  },
};

export const DirectEntryDone: Story = {
  parameters: {
    router: {
      initialPath: "/storybook-book/settings/classifications?organize=true",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("region", { name: "Organize Asset Classes" });
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await expect(
      await canvas.findByRole("button", { name: "Organize" }),
    ).toBeVisible();
  },
};

export const DragIntoChildlessClass: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    await canvas.findByRole("region", { name: "Organize Asset Classes" });
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
