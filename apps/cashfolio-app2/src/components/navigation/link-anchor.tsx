import { Anchor, type AnchorProps } from "@mantine/core";
import { createLink } from "@tanstack/react-router";
import { forwardRef } from "react";

const AnchorLinkBase = forwardRef<HTMLAnchorElement, AnchorProps>(
  function AnchorLinkBase(props, ref) {
    return <Anchor ref={ref} {...props} />;
  },
);

export const LinkAnchor = createLink(AnchorLinkBase);
