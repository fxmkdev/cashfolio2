import { expect, userEvent, waitFor, within } from "storybook/test";

export async function selectListing(canvasElement: HTMLElement, id: string) {
  canvasElement.querySelector<HTMLElement>(".ag-grid-viewport")!.scrollLeft = 0;
  // AG Grid row IDs disambiguate the same name/symbol on different exchanges.
  let cell: HTMLElement | null = null;
  await waitFor(() => {
    cell = canvasElement.querySelector(`[row-id="${id}"] [col-id="name"]`);
    expect(cell).toBeVisible();
  });
  await userEvent.click(cell!);
  return within(
    await within(canvasElement).findByRole("region", {
      name: "Security Details",
    }),
  );
}

async function openColumnFilter(canvasElement: HTMLElement, column: string) {
  // Column IDs also work for headers virtualized outside the visible viewport.
  const viewport =
    canvasElement.querySelector<HTMLElement>(".ag-grid-viewport")!;
  viewport.scrollLeft =
    column === "name" || column === "symbol" ? 0 : viewport.scrollWidth;
  let header: HTMLElement | null = null;
  await waitFor(() => {
    header = canvasElement.querySelector(`.ag-header-cell[col-id="${column}"]`);
    expect(header).not.toBeNull();
  });
  header!.scrollIntoView({ block: "nearest", inline: "nearest" });
  header!.focus();
  await userEvent.keyboard("{Control>}{Enter}{/Control}");
  let popup: HTMLElement | null = null;
  await waitFor(() => {
    popup = canvasElement.ownerDocument.querySelector(".ag-filter");
    expect(popup).toBeVisible();
  });
  return popup!;
}

export async function setTextFilter(
  canvasElement: HTMLElement,
  column: string,
  value: string,
) {
  const popup = await openColumnFilter(canvasElement, column);
  const input = within(popup).getByRole("textbox", { name: "Filter Value" });
  await userEvent.clear(input);
  await userEvent.type(input, value);
  await userEvent.keyboard("{Escape}");
}

export async function setListFilter(
  canvasElement: HTMLElement,
  column: string,
  values: string[],
) {
  const popup = await openColumnFilter(canvasElement, column);
  async function toggle(label: string) {
    const text = await within(popup).findByText(label, { exact: true });
    // AG Grid places the label beside its checkbox rather than linking it.
    const input = text
      .closest(".ag-set-filter-item")
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!input) throw new Error(`Missing filter checkbox: ${label}`);
    await userEvent.click(input);
  }
  await toggle("(Select All)");
  for (const value of values) await toggle(value);
  await userEvent.keyboard("{Escape}");
}
