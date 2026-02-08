import { createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "blue",
  defaultRadius: "md",
  fontFamily: "Inter, sans-serif",
});

export function getTheme() {
  return typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-mantine-color-scheme") ===
      "dark"
    ? "dark"
    : "light";
}
