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
  await within(canvasElement).findByRole("button", { name: "Copy Symbol" });
  return within(
    await within(canvasElement).findByRole("region", {
      name: "Security Details",
    }),
  );
}
