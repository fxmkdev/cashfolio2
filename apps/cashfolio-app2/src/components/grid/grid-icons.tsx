import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { renderToStaticMarkup } from "react-dom/server";

// Tree chevrons must not depend on CSS mask rendering.
export const gridIcons = {
  groupExpanded: renderToStaticMarkup(
    <IconChevronDown
      className="ag-icon"
      size={16}
      aria-hidden="true"
      focusable="false"
    />,
  ),
  groupContracted: renderToStaticMarkup(
    <IconChevronRight
      className="ag-icon"
      size={16}
      aria-hidden="true"
      focusable="false"
    />,
  ),
};
