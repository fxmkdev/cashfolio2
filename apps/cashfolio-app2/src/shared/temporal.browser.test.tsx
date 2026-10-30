import { MantineProvider } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, inject, test } from "vitest";
import { Temporal as FallbackTemporal } from "temporal-polyfill/implementation";
import { Temporal } from "./temporal";
import {
  createDateInputValueFromUtcDay,
  formatDateInputValueAsUtcDayIsoString,
  getDateInputValueFormat,
} from "./date";

declare module "vitest" {
  interface ProvidedContext {
    temporalMode: "native" | "polyfill";
  }
}

test("selects the Temporal implementation specified by the project", () => {
  const native = Reflect.get(globalThis, "Temporal") as
    typeof Temporal | undefined;
  if (inject("temporalMode") === "native") {
    expect(native).toBeDefined();
    expect(Temporal).toBe(native);
  } else {
    expect(Temporal).toBe(FallbackTemporal);
  }
});

test.each([
  ["en-US", "03/29/2026"],
  ["de-CH", "29.03.2026"],
  ["fr-FR", "29/03/2026"],
])(
  "DateInput displays and submits the same calendar day in %s",
  (locale, label) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const pickerDate = createDateInputValueFromUtcDay(
      "2026-03-29T00:00:00.000Z",
    );
    try {
      flushSync(() => {
        root.render(
          <MantineProvider>
            <DateInput
              value={pickerDate}
              valueFormat={getDateInputValueFormat(locale)}
            />
          </MantineProvider>,
        );
      });
      expect(host.querySelector("input")?.value).toBe(label);
      expect(formatDateInputValueAsUtcDayIsoString(pickerDate, locale)).toBe(
        "2026-03-29T00:00:00.000Z",
      );
    } finally {
      flushSync(() => root.unmount());
      host.remove();
    }
  },
);
