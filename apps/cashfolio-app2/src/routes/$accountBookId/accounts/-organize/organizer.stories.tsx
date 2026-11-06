import { useState } from "react";
import { Alert, Box, Button } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AccountOrganizer } from "./organizer";
import { createOrganizerStoryApi, organizeStoryNodes } from "./story-fixtures";
import { useOrganizer, type OrganizerApi } from "./use-organizer";
import { OrganizerActions } from "./organizer-actions";
import { useGlobalLoading } from "@/components/navigation/global-loading";

function Harness({
  failure,
  useProvidedApi = false,
  ...props
}: {
  accountBookId: string;
  api: OrganizerApi;
  onSaved: () => void;
  onDone: () => void;
  useProvidedApi?: boolean;
  failure?: "busy" | "network" | "load";
}) {
  const [api] = useState(() =>
    useProvidedApi ? props.api : createOrganizerStoryApi(failure),
  );
  const organizer = useOrganizer(props.onSaved, api);
  useGlobalLoading(organizer.loading || organizer.submitState.isRefreshing);
  return (
    <Box h={650} style={{ display: "flex", flexDirection: "column" }}>
      <OrganizerActions organizer={organizer} onDone={props.onDone} />
      {organizer.loadError && (
        <Alert role="alert">
          {organizer.loadError}
          <Button onClick={() => void organizer.load()}>Refresh Choices</Button>
        </Alert>
      )}
      {organizer.snapshot && (
        <AccountOrganizer
          accountBookId={props.accountBookId}
          organizer={organizer}
        />
      )}
    </Box>
  );
}

const meta = {
  title: "Routes/Accounts/Organize",
  component: Harness,
  args: {
    accountBookId: "story-book",
    onDone: fn(),
    onSaved: fn(),
    api: createOrganizerStoryApi(),
  },
  render: (args) => <Harness {...args} />,
} satisfies Meta<typeof Harness>;
export default meta;
type Story = StoryObj<typeof meta>;

async function row(canvasElement: HTMLElement, id: string) {
  let found: HTMLElement | null = null;
  await waitFor(() => {
    found = canvasElement.querySelector<HTMLElement>(`.ag-row[row-id="${id}"]`);
    expect(found).not.toBeNull();
    expect(found).toBeVisible();
    expect(found!.querySelector(".ag-group-value")).not.toBeNull();
  });
  return found!;
}
async function select(canvasElement: HTMLElement, id: string) {
  const element = await row(canvasElement, id);
  const checkbox = element.querySelector<HTMLElement>(
    ".ag-selection-checkbox input",
  )!;
  await userEvent.click(checkbox);
}
async function chooseMove(
  canvasElement: HTMLElement,
  destination = "Long-Term",
) {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(
    within(
      canvas.getByRole("toolbar", { name: "Organize Account Actions" }),
    ).getByRole("button", {
      name: "Move To…",
    }),
  );
  const dialog = within(await body.findByRole("dialog", { name: "Move To…" }));
  await userEvent.click(dialog.getByLabelText("Destination"));
  const option = (await body.findAllByRole("option")).find((item) =>
    within(item).queryByText(destination, { exact: true }),
  );
  if (!option) throw new Error(`Missing destination ${destination}`);
  await userEvent.click(within(option).getByText(destination, { exact: true }));
  return dialog;
}

function handleStabilityScenario(failure = false): NonNullable<Story["play"]> {
  return async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    );
    const source = await row(canvasElement, "checking");
    const target = await row(canvasElement, "investments");
    const destination = await row(canvasElement, "destination");
    const archived = await row(canvasElement, "archived");
    // Showing archived rows animates existing siblings down. Start the gesture
    // once the new neighbor positions settle, rather than aiming at old bounds.
    await waitFor(() =>
      expect(
        destination.getBoundingClientRect().top -
          archived.getBoundingClientRect().top,
      ).toBeCloseTo(destination.getBoundingClientRect().height, 0),
    );
    const baseline = [source, target, destination].map((element) => ({
      id: element.getAttribute("row-id")!,
      handle: element.querySelector<HTMLElement>(".ag-row-drag")!,
      nameX: element.querySelector(".ag-group-value")!.getBoundingClientRect()
        .x,
    }));
    const assertStable = async () => {
      for (const { id, nameX } of baseline) {
        const element = await row(canvasElement, id);
        const handle = element.querySelector<HTMLElement>(".ag-row-drag")!;
        await expect(handle).toBeVisible();
        await expect(handle.getBoundingClientRect().width).toBeGreaterThan(0);
        await expect(
          element.querySelector(".ag-group-value")!.getBoundingClientRect().x,
        ).toBeCloseTo(nameX, 1);
      }
      const archivedHandle =
        archived.querySelector<HTMLElement>(".ag-row-drag")!;
      await expect(archivedHandle).toBeVisible();
      await expect(
        archivedHandle.getBoundingClientRect().width,
      ).toBeGreaterThan(0);
    };
    let finishSave!: () => void;
    let finishRecovery!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const recoveryGate = new Promise<void>((resolve) => {
      finishRecovery = resolve;
    });
    const originalMove = args.api.move;
    const originalLoad = args.api.load;
    const move = fn(async (...parameters: Parameters<typeof originalMove>) => {
      await saveGate;
      return originalMove(...parameters);
    });
    const load = fn(async () => {
      await recoveryGate;
      return originalLoad();
    });
    args.api.move = move;
    args.api.load = load;
    const user = userEvent.setup();
    const handle = baseline[0]!.handle;
    const from = handle.getBoundingClientRect();
    let pointerStep = 0;
    const point = (element: HTMLElement, middle = false) => {
      const bounds = element.getBoundingClientRect();
      return {
        target: element,
        coords: {
          clientX: bounds.x + 180 + (pointerStep++ % 2) * 2,
          clientY: bounds.y + (middle ? bounds.height / 2 : 3),
        },
      };
    };
    try {
      await user.pointer([
        {
          target: handle,
          coords: { clientX: from.x + 5, clientY: from.y + 5 },
          keys: "[MouseLeft>]",
        },
        point(destination, true),
        point(destination, true),
      ]);
      await expect(
        canvas.getByText(/Move 1 item into Long-Term/),
      ).toBeVisible();
      await assertStable();
      await user.pointer([point(archived, true), point(archived, true)]);
      await expect(
        canvas.getByText(/Move 1 item after Old Fund/),
      ).toBeVisible();
      await assertStable();
      await user.pointer([point(source), point(source)]);
      await expect(
        canvas.getByText(/Select an available sibling/),
      ).toBeVisible();
      await assertStable();
      await user.pointer([point(target), point(target)]);
      await expect(
        canvas.getByText(/Move 1 item before Investments/),
      ).toBeVisible();
      await assertStable();
      for (const { id, handle } of baseline)
        await expect(
          (await row(canvasElement, id)).querySelector(".ag-row-drag"),
        ).toBe(handle);
      await user.pointer({ ...point(target), keys: "[/MouseLeft]" });
      await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
      await expect(canvas.getByRole("button", { name: "Done" })).toBeDisabled();
      await assertStable();
      const blockedHandle = target.querySelector<HTMLElement>(".ag-row-drag")!;
      await expect(blockedHandle).toHaveStyle({
        pointerEvents: "none",
        opacity: "0.4",
      });
      const bounds = blockedHandle.getBoundingClientRect();
      const hit = canvasElement.ownerDocument.elementFromPoint(
        bounds.x + 5,
        bounds.y + 5,
      )!;
      await expect(blockedHandle.contains(hit)).toBe(false);
      await user.pointer([
        {
          target: hit,
          coords: { clientX: bounds.x + 5, clientY: bounds.y + 5 },
          keys: "[MouseLeft>]",
        },
        point(destination, true),
        { ...point(destination, true), keys: "[/MouseLeft]" },
      ]);
      await expect(move).toHaveBeenCalledTimes(1);
      await expect(
        canvasElement.ownerDocument.querySelector(".ag-dnd-ghost"),
      ).toBeNull();
      finishSave();
      if (failure) {
        await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
        await expect(
          canvas.getByRole("button", { name: "Done" }),
        ).toBeDisabled();
        await assertStable();
        await expect(target.querySelector(".ag-row-drag")).toHaveStyle({
          pointerEvents: "none",
        });
      }
      finishRecovery();
      await waitFor(() =>
        expect(canvas.getByRole("button", { name: "Done" })).toBeEnabled(),
      );
      await assertStable();
      await expect(target.querySelector(".ag-row-drag")).toHaveStyle({
        pointerEvents: "auto",
      });
      await expect(move).toHaveBeenCalledTimes(1);
      if (failure) {
        await expect(canvas.getByRole("alert")).toHaveTextContent(
          "could not confirm",
        );
        await expect(await row(canvasElement, "checking")).toHaveAttribute(
          "row-index",
          "5",
        );
      } else {
        await expect(await row(canvasElement, "checking")).toHaveAttribute(
          "row-index",
          "0",
        );
      }
    } finally {
      finishSave();
      finishRecovery();
      args.api.move = originalMove;
      args.api.load = originalLoad;
    }
  };
}

export const StableHandlesDuringDragAndSave: Story = {
  args: { api: createOrganizerStoryApi() },
  render: (args) => <Harness {...args} useProvidedApi />,
  play: handleStabilityScenario(),
};

export const StableHandlesDuringRecovery: Story = {
  args: { api: createOrganizerStoryApi("network") },
  render: (args) => <Harness {...args} useProvidedApi />,
  play: handleStabilityScenario(true),
};

export const BulkSubtreeMove: Story = {
  play: async ({ canvasElement, args }) => {
    await select(canvasElement, "investments");
    await select(canvasElement, "checking");
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("toolbar", { name: "Organize Account Actions" }),
    ).toHaveTextContent("1 group and 1 account selected");
    const dialog = await chooseMove(canvasElement);
    await expect(dialog.getByText(/3 included descendants/)).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole("dialog"),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(args.onSaved).toHaveBeenCalled());
    await expect(await row(canvasElement, "investments")).toHaveClass(
      "ag-row-level-1",
    );
  },
};

export const ArchivedSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    );
    await waitFor(async () =>
      expect(await row(canvasElement, "archived")).toBeVisible(),
    );
    await select(canvasElement, "archived");
    await expect(
      canvas.getByRole("toolbar", { name: "Organize Account Actions" }),
    ).toHaveTextContent("0 groups and 1 account selected");
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Selection" }),
    );
    await select(canvasElement, "empty");
    await expect(
      canvas.getByRole("toolbar", { name: "Organize Account Actions" }),
    ).toHaveTextContent("1 group and 0 accounts selected");
  },
};

export const ArchivedVisibilityAndSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    );
    const nested = await row(canvasElement, "nested");
    await userEvent.click(
      nested.querySelector<HTMLElement>(".ag-group-contracted")!,
    );
    await expect(await row(canvasElement, "holding")).toBeVisible();
    const gridTop = canvas.getByRole("treegrid").getBoundingClientRect().top;
    await select(canvasElement, "archived");
    await select(canvasElement, "empty");
    await expect(
      canvas.getByRole("treegrid").getBoundingClientRect().top,
    ).toBeCloseTo(gridTop, 0);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    );
    await waitFor(() =>
      expect(canvasElement.querySelector('[row-id="archived"]')).toBeNull(),
    );
    await expect(
      canvas.getByRole("toolbar", { name: "Organize Account Actions" }),
    ).toHaveTextContent("1 group and 0 accounts selected");
    await expect(
      canvas.getByText(/1 hidden archived item was deselected/),
    ).toBeInTheDocument();
    await expect(await row(canvasElement, "holding")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    );
    await expect(
      (await row(canvasElement, "archived")).querySelector(
        ".ag-selection-checkbox input",
      ),
    ).not.toBeChecked();
    await expect(await row(canvasElement, "holding")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Selection" }),
    );
    await expect(
      canvas.queryByRole("toolbar", { name: "Organize Account Actions" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    );
    await select(canvasElement, "investments");
    const dialog = await chooseMove(canvasElement);
    await expect(
      dialog.getByText(/3 included descendants \(1 archived\)/),
    ).toBeVisible();
    await expect(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    ).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Selection" }),
    );
    await select(canvasElement, "checking");
    const anchors = await chooseMove(canvasElement, "Investments");
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(anchors.getByRole("radio", { name: "Before" }));
    await userEvent.click(anchors.getByLabelText("Sibling"));
    await expect(body.getByRole("option", { name: "Brokerage" })).toBeVisible();
    await expect(
      body.queryByRole("option", { name: "Old Fund (Archived)" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(anchors.getByRole("button", { name: "Cancel" }));
  },
};

export const ArchivedOnlyEmptyState: Story = {
  args: {
    api: createOrganizerStoryApi(
      undefined,
      organizeStoryNodes
        .filter((node) => !node.isActive)
        .map((node) => ({ ...node, parentId: null })),
    ),
  },
  render: (args) => <Harness {...args} useProvidedApi />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/There are no active accounts or groups/),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Show Archived" }),
    );
    await expect(await row(canvasElement, "archived")).toBeVisible();
  },
};

export const RelativePlacementAndCashPreview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await select(canvasElement, "checking");
    const dialog = await chooseMove(canvasElement, "Cash");
    await expect(
      dialog.getByText(/changes the Cash Account setting for 1 item/),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const toolbar = within(
      canvas.getByRole("toolbar", { name: "Organize Account Actions" }),
    );
    await userEvent.click(toolbar.getByRole("button", { name: "Move To…" }));
    const next = within(await body.findByRole("dialog"));
    await userEvent.click(next.getByRole("radio", { name: "Before" }));
    await userEvent.click(next.getByLabelText("Sibling"));
    await userEvent.click(body.getByRole("option", { name: "Investments" }));
    await userEvent.click(next.getByRole("button", { name: "Move" }));
    await waitFor(async () =>
      expect(await row(canvasElement, "checking")).toHaveClass(
        "ag-row-level-0",
      ),
    );
  },
};

export const DestinationTreeAndSegmentedPosition: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Move Checking" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Move To…" }),
    );
    const destination = dialog.getByLabelText("Destination");
    const position = within(
      dialog.getByRole("radiogroup", { name: "Position" }),
    );
    await expect(destination).toHaveValue("Top Level");
    await expect(position.getByRole("radio", { name: "Last" })).toBeChecked();
    await userEvent.click(destination);
    const parent = body
      .getAllByRole("option")
      .find((option) =>
        within(option).queryByText("Investments", { exact: true }),
      )!;
    await expect(parent).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(
      within(parent).getByRole("button", { name: "Expand" }),
    );
    const nested = body.getByRole("option", { name: "Brokerage" });
    await expect(nested).toHaveAttribute("aria-level", "2");
    await userEvent.click(nested);
    await expect(destination).toHaveValue("Brokerage");
    await userEvent.click(position.getByRole("radio", { name: "Last" }));
    await userEvent.keyboard("{ArrowRight}");
    await expect(position.getByRole("radio", { name: "Before" })).toBeChecked();
    await userEvent.click(dialog.getByLabelText("Sibling"));
    await userEvent.click(body.getByRole("option", { name: "Fund" }));
    await expect(dialog.getByRole("button", { name: "Move" })).toBeEnabled();
    await userEvent.click(destination);
    await userEvent.click(body.getByRole("option", { name: "Empty Group" }));
    await expect(
      position.getByRole("radio", { name: "Before" }),
    ).toBeDisabled();
    await expect(position.getByRole("radio", { name: "After" })).toBeDisabled();
    await userEvent.click(position.getByRole("radio", { name: "Last" }));
    await expect(dialog.queryByLabelText("Sibling")).not.toBeInTheDocument();
    await userEvent.click(destination);
    await userEvent.clear(destination);
    await userEvent.type(destination, "  INVESTMENTS / brokerage  ");
    await userEvent.click(body.getByRole("option", { name: "Brokerage" }));
    await expect(destination).toHaveValue("Brokerage");
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  },
};

export const DragIntoGroup: Story = {
  play: async ({ canvasElement }) => {
    const source = await row(canvasElement, "checking");
    const target = await row(canvasElement, "destination");
    const handle = source.querySelector<HTMLElement>(".ag-row-drag")!;
    await expect(handle).not.toBeNull();
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
      expect(await row(canvasElement, "checking")).toHaveClass(
        "ag-row-level-1",
      ),
    );
  },
};

export const DragReorderAndCancel: Story = {
  play: async ({ canvasElement }) => {
    const source = await row(canvasElement, "checking");
    const target = await row(canvasElement, "investments");
    const handle = source.querySelector<HTMLElement>(".ag-row-drag")!;
    const from = handle.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const user = userEvent.setup();
    await user.pointer([
      {
        target: handle,
        coords: { clientX: from.x + 5, clientY: from.y + 5 },
        keys: "[MouseLeft>]",
      },
      { target, coords: { clientX: to.x + 180, clientY: to.y + 3 } },
      { target, coords: { clientX: to.x + 182, clientY: to.y + 3 } },
    ]);
    await expect(
      within(canvasElement).getByText(/Move 1 item before Investments/),
    ).toBeVisible();
    await user.keyboard("{Escape}");
    await user.pointer({ target, keys: "[/MouseLeft]" });
    await expect(source).toHaveAttribute("row-index", "4");

    await user.pointer([
      {
        target: handle,
        coords: { clientX: from.x + 5, clientY: from.y + 5 },
        keys: "[MouseLeft>]",
      },
      { target, coords: { clientX: to.x + 180, clientY: to.y + 3 } },
      { target, coords: { clientX: to.x + 182, clientY: to.y + 3 } },
      {
        target,
        coords: { clientX: to.x + 182, clientY: to.y + 3 },
        keys: "[/MouseLeft]",
      },
    ]);
    await waitFor(async () =>
      expect(await row(canvasElement, "checking")).toHaveAttribute(
        "row-index",
        "0",
      ),
    );
  },
};

export const DragSelectedSubtreeAndMoveToTopLevel: Story = {
  play: async ({ canvasElement }) => {
    await select(canvasElement, "investments");
    await select(canvasElement, "nested");
    await select(canvasElement, "checking");
    const source = await row(canvasElement, "investments");
    const target = await row(canvasElement, "destination");
    const handle = source.querySelector<HTMLElement>(".ag-row-drag")!;
    const from = handle.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    await userEvent.pointer([
      {
        target: handle,
        coords: { clientX: from.x + 5, clientY: from.y + 5 },
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
      expect(await row(canvasElement, "investments")).toHaveClass(
        "ag-row-level-1",
      ),
    );
    await expect(await row(canvasElement, "checking")).toHaveClass(
      "ag-row-level-1",
    );
    await expect(await row(canvasElement, "nested")).toHaveClass(
      "ag-row-level-2",
    );
    const canvas = within(canvasElement);
    await userEvent.click(
      within(
        canvas.getByRole("toolbar", { name: "Organize Account Actions" }),
      ).getByRole("button", {
        name: "Move To…",
      }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Move To…",
      }),
    );
    await expect(dialog.getByLabelText("Destination")).toHaveValue("Top Level");
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await waitFor(async () =>
      expect(await row(canvasElement, "investments")).toHaveClass(
        "ag-row-level-0",
      ),
    );
    await expect(await row(canvasElement, "checking")).toHaveClass(
      "ag-row-level-0",
    );
    await expect(await row(canvasElement, "nested")).toHaveClass(
      "ag-row-level-1",
    );
  },
};

export const BusyFailureAndRetry: Story = {
  render: (args) => <Harness {...args} failure="busy" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await select(canvasElement, "checking");
    const dialog = await chooseMove(canvasElement);
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "No changes were saved",
    );
    await expect(await row(canvasElement, "checking")).toHaveClass(
      "ag-row-level-0",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await userEvent.click(canvas.getByRole("button", { name: "Try Again" }));
    await waitFor(async () =>
      expect(await row(canvasElement, "checking")).toHaveClass(
        "ag-row-level-1",
      ),
    );
  },
};

export const UncertainFailureRequiresRefresh: Story = {
  render: (args) => <Harness {...args} failure="network" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await select(canvasElement, "checking");
    const dialog = await chooseMove(canvasElement);
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "could not confirm",
    );
    await expect(
      canvas.queryByRole("button", { name: "Try Again" }),
    ).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Refresh Choices" }),
    );
    await expect(await row(canvasElement, "checking")).toHaveClass(
      "ag-row-level-0",
    );
  },
};

export const LoadRecovery: Story = {
  render: (args) => <Harness {...args} failure="load" />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Could not load",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Refresh Choices" }),
    );
    await expect(await row(canvasElement, "checking")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await expect(args.onDone).toHaveBeenCalled();
  },
};
