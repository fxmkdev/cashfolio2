import { createTheme, Tooltip } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "blue",
  defaultRadius: "md",
  fontFamily: "Inter, sans-serif",
  components: {
    Tooltip: Tooltip.extend({
      defaultProps: {
        openDelay: 500,
      },
    }),
  },
});
