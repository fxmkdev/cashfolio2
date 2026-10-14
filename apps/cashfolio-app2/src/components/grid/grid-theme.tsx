import { themeQuartz } from "ag-grid-enterprise";
import "./grid-theme.css";

export const gridTheme = themeQuartz.withParams({
  textColor: "var(--mantine-color-text)",
  menuTextColor: "var(--mantine-color-text)",
  headerFontSize: "var(--mantine-font-size-sm)",
  spacing: 7,
  backgroundColor: "var(--mantine-color-body)",
  chromeBackgroundColor: "var(--mantine-color-default-hover)",
  borderColor: "var(--mantine-color-default-border)",
  foregroundColor: "var(--mantine-color-text)",
  accentColor: "var(--mantine-primary-color-filled)",
  rangeSelectionBorderColor: "var(--mantine-primary-color-filled)",
  fontFamily: "Inter, sans-serif",
});
