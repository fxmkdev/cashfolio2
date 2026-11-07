import { expect, userEvent, waitFor, within } from "storybook/test";
export async function findVisibleDialog(
  body: ReturnType<typeof within>,
  name: string,
) {
  const dialog = await body.findByRole("dialog", { name });
  await waitFor(() => expect(dialog).toBeVisible());
  return dialog;
}

export async function openGainLossDetails(canvasElement: HTMLElement) {
  await userEvent.click(
    await within(canvasElement).findByRole("button", {
      name: "Show Gain/Loss Details",
    }),
  );
  return findVisibleDialog(
    within(canvasElement.ownerDocument.body),
    "Gain/Loss Details",
  );
}

export async function chooseAccountGrouping(
  canvasElement: HTMLElement,
  label: "Asset Class" | "Account Structure",
) {
  await userEvent.click(within(canvasElement).getByLabelText("Group By"));
  await userEvent.click(
    within(canvasElement.ownerDocument.body).getByRole("option", {
      name: label,
    }),
  );
}

export function assetClassCell(canvasElement: HTMLElement, id: string) {
  return canvasElement.querySelector(`[row-id="${id}"] [col-id="assetClass"]`);
}

export function assignmentCheckbox(canvasElement: HTMLElement, id: string) {
  return canvasElement.querySelector<HTMLInputElement>(
    `.ag-row[row-id="${id}"] .ag-selection-checkbox input`,
  );
}

export async function selectAssignmentAccount(
  canvasElement: HTMLElement,
  id: string,
) {
  // Reparenting briefly retains fading copies with the same stable row ID.
  await waitFor(() =>
    expect(canvasElement.querySelector(".ag-row.ag-opacity-zero")).toBeNull(),
  );
  const selector = `.ag-row:not(.ag-opacity-zero)[row-id="${id}"] .ag-selection-checkbox input`;
  await waitFor(() =>
    expect(canvasElement.querySelector(selector)).not.toBeNull(),
  );
  await userEvent.click(canvasElement.querySelector(selector)!);
}

export async function expandAssignmentGroup(
  canvasElement: HTMLElement,
  id: string,
) {
  await waitFor(() =>
    expect(canvasElement.querySelector(".ag-row.ag-opacity-zero")).toBeNull(),
  );
  const selector = `.ag-row:not(.ag-opacity-zero)[row-id="${id}"] .ag-group-contracted`;
  await waitFor(() =>
    expect(canvasElement.querySelector(selector)).not.toBeNull(),
  );
  await userEvent.click(canvasElement.querySelector(selector)!);
  await waitFor(() =>
    expect(
      canvasElement.querySelector(
        `.ag-row:not(.ag-opacity-zero)[row-id="${id}"]`,
      ),
    ).toHaveAttribute("aria-expanded", "true"),
  );
}
