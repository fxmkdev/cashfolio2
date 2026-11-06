import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { createOrganizerStoryApi } from "./story-fixtures";
import {
  organizerStoryMeta,
  Harness,
  row,
  type OrganizerStory as Story,
} from "./story-harness";
const meta = {
  ...organizerStoryMeta,
  title: "Routes/Accounts/Organize",
  component: Harness,
};
export default meta;

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
